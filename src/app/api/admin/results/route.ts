import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceClient } from "@/lib/supabase/server";
import { applyMatchday, logSyncRun } from "@/lib/matches/apply";
import { fetchMatchdayFromApi, FootballDataError } from "@/lib/matches/football-data";
import { recomputeMatchday } from "@/lib/scoring/persist";
import { env } from "@/lib/env";

const schema = z.object({
  season: z.number().int().min(2000).max(2100),
  number: z.number().int().min(1).max(38),
});

async function findMatchday(
  admin: ReturnType<typeof serviceClient>,
  season: number,
  number: number,
) {
  const { data } = await admin
    .from("matchdays")
    .select("id")
    .eq("season", season)
    .eq("number", number)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Scarica i risultati finali e ricalcola i punteggi.
 *
 * Passa dalla stessa `applyMatchday` del calendario: i gol vengono scritti
 * solo per le partite davvero concluse, e una rinviata non fa saltare
 * niente — semplicemente non produce punti finché non si gioca.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: auth.status });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi." }, { status: 400 });
  }

  const { season, number } = parsed.data;
  const admin = serviceClient();

  try {
    const inputs = await fetchMatchdayFromApi(season, number, env.footballDataApiKey);

    if (inputs.length === 0) {
      return NextResponse.json(
        { error: `Nessuna partita per la giornata ${number}.` },
        { status: 404 },
      );
    }

    const applied = await applyMatchday(admin, {
      season,
      number,
      inputs,
      source: "api",
    });

    const scored = await recomputeMatchday(admin, {
      leagueId: auth.session.leagueId,
      matchdayId: applied.matchdayId,
    });

    await logSyncRun(admin, {
      kind: "results",
      matchdayId: applied.matchdayId,
      status: "ok",
      message: `${scored.finishedMatches}/${scored.totalMatches} partite finite, ${scored.scoredRows} punteggi.`,
    });

    return NextResponse.json({ ok: true, ...scored });
  } catch (error) {
    const httpStatus =
      error instanceof FootballDataError ? (error.httpStatus ?? null) : null;

    console.error("[/api/admin/results] sync risultati fallito:", error);
    await logSyncRun(admin, {
      kind: "results",
      status: "error",
      httpStatus,
      message: (error as Error).message.slice(0, 500),
    });

    return NextResponse.json(
      {
        error:
          httpStatus === 401 || httpStatus === 403
            ? "football-data ha rifiutato la chiave API."
            : "Sincronizzazione dei risultati fallita. Puoi inserire i risultati a mano e poi ricalcolare.",
      },
      { status: 502 },
    );
  }
}

/**
 * Ricalcolo forzato, senza toccare football-data.
 *
 * È la via da usare dopo aver corretto un risultato a mano: rifà i conti
 * sui dati già presenti, bonus "unico" compreso — che dipende dai
 * pronostici di tutti e va quindi sempre ricalcolato per intero.
 */
export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: auth.status });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi." }, { status: 400 });
  }

  const { season, number } = parsed.data;
  const admin = serviceClient();

  const matchdayId = await findMatchday(admin, season, number);
  if (!matchdayId) {
    return NextResponse.json(
      { error: `La giornata ${number} non esiste ancora.` },
      { status: 404 },
    );
  }

  try {
    const scored = await recomputeMatchday(admin, {
      leagueId: auth.session.leagueId,
      matchdayId,
    });

    await admin.from("audit_log").insert({
      actor_id: auth.session.playerId,
      action: "scores.recompute",
      entity: "matchday",
      entity_id: matchdayId,
      after: scored,
    });

    return NextResponse.json({ ok: true, ...scored });
  } catch (error) {
    console.error("[/api/admin/results] ricalcolo fallito:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Ricalcolo fallito." },
      { status: 500 },
    );
  }
}
