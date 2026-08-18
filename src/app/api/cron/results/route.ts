import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { serviceClient } from "@/lib/supabase/server";
import { applyMatchday, logSyncRun } from "@/lib/matches/apply";
import { fetchMatchdayFromApi } from "@/lib/matches/football-data";
import { recomputeMatchday } from "@/lib/scoring/persist";
import { env } from "@/lib/env";

/** Quante giornate incompiute guardare a ogni giro. */
const MAX_MATCHDAYS = 3;

/**
 * Scarica i risultati delle giornate iniziate ma non ancora chiuse, e
 * ricalcola i punteggi di ogni lega.
 *
 * Si ferma alle giornate già cominciate: prima del lock non c'è nulla da
 * assegnare. Una giornata resta in lavorazione finché tutte le sue partite
 * non sono concluse, così un recupero al mercoledì entra in classifica da
 * solo, senza bisogno che qualcuno se ne ricordi.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const admin = serviceClient();

  try {
    const nowIso = new Date().toISOString();

    // Giornate già iniziate a cui manca ancora qualche risultato.
    const { data: pending } = await admin
      .from("matchdays")
      .select("id, season, number")
      .lte("lock_at", nowIso)
      .neq("status", "scored")
      .order("number", { ascending: false })
      .limit(MAX_MATCHDAYS);

    if (!pending || pending.length === 0) {
      return NextResponse.json({ ok: true, message: "Nessuna giornata da chiudere." });
    }

    const { data: leagues } = await admin.from("leagues").select("id");

    const report: Array<{
      matchday: number;
      finished: number;
      total: number;
      complete: boolean;
    }> = [];

    for (const day of pending) {
      const season = day.season as number;
      const number = day.number as number;

      // Il calendario passa dalla stessa funzione del sync: se una partita
      // è stata rinviata dopo il lock, lo stato si aggiorna e i suoi punti
      // semplicemente non vengono assegnati.
      const inputs = await fetchMatchdayFromApi(
        season,
        number,
        env.footballDataApiKey,
      );

      if (inputs.length > 0) {
        await applyMatchday(admin, { season, number, inputs, source: "api" });
      }

      let last = { finishedMatches: 0, totalMatches: 0, complete: false };
      for (const league of leagues ?? []) {
        last = await recomputeMatchday(admin, {
          leagueId: league.id as string,
          matchdayId: day.id as string,
        });
      }

      report.push({
        matchday: number,
        finished: last.finishedMatches,
        total: last.totalMatches,
        complete: last.complete,
      });
    }

    await logSyncRun(admin, {
      kind: "results",
      status: "ok",
      message: `cron: ${report.map((r) => `g${r.matchday} ${r.finished}/${r.total}`).join(", ")}`,
    });

    return NextResponse.json({ ok: true, matchdays: report });
  } catch (error) {
    console.error("[cron/results] fallito:", error);
    await logSyncRun(admin, {
      kind: "results",
      status: "error",
      message: (error as Error).message.slice(0, 500),
    });
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
