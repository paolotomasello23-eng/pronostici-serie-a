import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { serviceClient } from "@/lib/supabase/server";
import { applyMatchday, logSyncRun } from "@/lib/matches/apply";
import {
  fetchCurrentSeason,
  fetchMatchdayFromApi,
} from "@/lib/matches/football-data";
import { env } from "@/lib/env";

/**
 * Aggiorna il calendario della giornata in corso e di quella dopo.
 *
 * Va rieseguito periodicamente perché gli orari di Serie A cambiano fino
 * all'ultimo: una partita spostata sposta anche il momento del lock. Su una
 * giornata già bloccata `applyMatchday` aggiorna tutto tranne il lock, che
 * resta dov'è.
 *
 * Tiene anche sveglio il progetto Supabase, che dopo circa una settimana
 * senza attività va in pausa e va risvegliato a mano.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const admin = serviceClient();

  try {
    const { season, currentMatchday } = await fetchCurrentSeason(
      env.footballDataApiKey,
    );

    const targets = [currentMatchday, currentMatchday + 1].filter(
      (n) => n >= 1 && n <= 38,
    );

    const done: Array<{ matchday: number; matches: number; locked: boolean }> = [];

    for (const number of targets) {
      const inputs = await fetchMatchdayFromApi(
        season,
        number,
        env.footballDataApiKey,
      );
      if (inputs.length === 0) continue;

      const result = await applyMatchday(admin, {
        season,
        number,
        inputs,
        source: "api",
      });

      done.push({
        matchday: number,
        matches: inputs.length,
        locked: result.lockedAlready,
      });
    }

    await logSyncRun(admin, {
      kind: "matches",
      status: "ok",
      message: `cron: ${done.map((d) => `g${d.matchday}=${d.matches}`).join(", ") || "niente da fare"}`,
    });

    return NextResponse.json({ ok: true, season, synced: done });
  } catch (error) {
    console.error("[cron/matches] fallito:", error);
    await logSyncRun(admin, {
      kind: "matches",
      status: "error",
      message: (error as Error).message.slice(0, 500),
    });
    // 500 perché il workflow lo segnali come fallito e resti visibile
    // nella cronologia, invece di passare inosservato.
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
