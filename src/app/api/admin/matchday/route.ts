import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceClient } from "@/lib/supabase/server";
import { applyMatchday, logSyncRun } from "@/lib/matches/apply";
import { fetchMatchdayFromApi, FootballDataError } from "@/lib/matches/football-data";
import { env } from "@/lib/env";
import type { MatchInput, MatchStatus } from "@/lib/matches/types";

/** Le partite di una giornata, per il pannello admin. */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: auth.status });
  }

  const url = new URL(request.url);
  const season = Number(url.searchParams.get("season"));
  const number = Number(url.searchParams.get("number"));

  if (!Number.isInteger(season) || !Number.isInteger(number)) {
    return NextResponse.json({ error: "Parametri non validi." }, { status: 400 });
  }

  const admin = serviceClient();

  const { data: matchday } = await admin
    .from("matchdays")
    .select("id, season, number, lock_at, status, source, last_synced_at")
    .eq("season", season)
    .eq("number", number)
    .maybeSingle();

  if (!matchday) {
    return NextResponse.json({ matchday: null, matches: [] });
  }

  const { data: matches } = await admin
    .from("matches")
    .select(
      "id, external_id, home_team, home_team_short, away_team, away_team_short, kickoff_at, status, home_goals, away_goals",
    )
    .eq("matchday_id", matchday.id)
    .order("kickoff_at");

  return NextResponse.json({ matchday, matches: matches ?? [] });
}

const syncSchema = z.object({
  season: z.number().int().min(2000).max(2100),
  number: z.number().int().min(1).max(38),
});

/** Scarica la giornata da football-data.org e la salva. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: auth.status });
  }

  const parsed = syncSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi." }, { status: 400 });
  }

  const { season, number } = parsed.data;
  const admin = serviceClient();

  try {
    const inputs = await fetchMatchdayFromApi(season, number, env.footballDataApiKey);

    if (inputs.length === 0) {
      await logSyncRun(admin, {
        kind: "matches",
        status: "error",
        message: `Nessuna partita per la giornata ${number}.`,
      });
      return NextResponse.json(
        {
          error: `football-data non ha restituito partite per la giornata ${number}. Controlla il numero, oppure inseriscile a mano.`,
        },
        { status: 404 },
      );
    }

    const result = await applyMatchday(admin, {
      season,
      number,
      inputs,
      source: "api",
    });

    await logSyncRun(admin, {
      kind: "matches",
      matchdayId: result.matchdayId,
      status: "ok",
      message: `${inputs.length} partite: ${result.inserted} inserite, ${result.updated} aggiornate.`,
    });

    return NextResponse.json({ ok: true, ...result, count: inputs.length });
  } catch (error) {
    const httpStatus =
      error instanceof FootballDataError ? (error.httpStatus ?? null) : null;
    const message = (error as Error).message;

    console.error("[/api/admin/matchday] sync fallito:", error);
    await logSyncRun(admin, {
      kind: "matches",
      status: "error",
      httpStatus,
      message: message.slice(0, 500),
    });

    return NextResponse.json(
      {
        error:
          httpStatus === 403 || httpStatus === 401
            ? "football-data ha rifiutato la chiave API. Controlla FOOTBALL_DATA_API_KEY."
            : "Sincronizzazione fallita. Puoi inserire le partite a mano.",
      },
      { status: 502 },
    );
  }
}

/**
 * Reimposta il lock di una giornata sul calcio d'inizio reale.
 *
 * Il lock, una volta scattato, non si ricalcola più da solo: è la regola
 * che impedisce di riaprire i pronostici a partite iniziate. Ma se è
 * scattato per sbaglio — un orario sbagliato inserito a mano, una prova
 * finita male — l'admin deve poter rimettere le cose a posto, altrimenti
 * quella giornata resta murata per sempre.
 *
 * È una decisione deliberata di una persona, non un automatismo, e resta
 * scritta nell'audit log.
 */
export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: auth.status });
  }

  const parsed = syncSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi." }, { status: 400 });
  }

  const { season, number } = parsed.data;
  const admin = serviceClient();

  const { data: matchday } = await admin
    .from("matchdays")
    .select("id, lock_at")
    .eq("season", season)
    .eq("number", number)
    .maybeSingle();

  if (!matchday) {
    return NextResponse.json({ error: "Giornata non trovata." }, { status: 404 });
  }

  const { data: matches } = await admin
    .from("matches")
    .select("kickoff_at, status")
    .eq("matchday_id", matchday.id);

  const kickoffs = (matches ?? [])
    .filter((m) => !["POSTPONED", "CANCELLED"].includes(m.status as string))
    .map((m) => m.kickoff_at as string)
    .sort();

  const lockAt = kickoffs[0] ?? null;

  if (!lockAt) {
    return NextResponse.json(
      { error: "Nessuna partita in calendario: non c'è un orario da cui ripartire." },
      { status: 409 },
    );
  }

  const stillLocked = new Date(lockAt).getTime() <= Date.now();

  await admin
    .from("matchdays")
    .update({ lock_at: lockAt, status: stillLocked ? "locked" : "open" })
    .eq("id", matchday.id);

  await admin.from("audit_log").insert({
    actor_id: auth.session.playerId,
    action: "matchday.reset_lock",
    entity: "matchday",
    entity_id: matchday.id,
    before: { lock_at: matchday.lock_at },
    after: { lock_at: lockAt },
  });

  return NextResponse.json({ ok: true, lockAt, stillLocked });
}

/**
 * Elimina una partita di troppo (un doppione, o una inserita per errore).
 *
 * Si rifiuta di farlo se qualcuno l'ha già pronosticata: cancellarla
 * significherebbe far sparire pronostici altrui senza che se ne accorgano.
 */
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: auth.status });
  }

  const matchId = new URL(request.url).searchParams.get("matchId");
  if (!matchId) {
    return NextResponse.json({ error: "Partita non indicata." }, { status: 400 });
  }

  const admin = serviceClient();

  const { count } = await admin
    .from("predictions")
    .select("id", { count: "exact", head: true })
    .eq("match_id", matchId);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Non si può eliminare: ci sono già ${count} pronostici su questa partita.`,
      },
      { status: 409 },
    );
  }

  const { data: before } = await admin
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();

  const { error } = await admin.from("matches").delete().eq("id", matchId);
  if (error) {
    return NextResponse.json({ error: "Eliminazione fallita." }, { status: 500 });
  }

  await admin.from("audit_log").insert({
    actor_id: auth.session.playerId,
    action: "match.delete",
    entity: "match",
    entity_id: matchId,
    before,
  });

  return NextResponse.json({ ok: true });
}

const STATUSES: readonly MatchStatus[] = [
  "SCHEDULED", "TIMED", "IN_PLAY", "PAUSED",
  "FINISHED", "POSTPONED", "SUSPENDED", "CANCELLED",
];

const manualSchema = z.object({
  season: z.number().int().min(2000).max(2100),
  number: z.number().int().min(1).max(38),
  matches: z
    .array(
      z.object({
        id: z.string().uuid().nullable().optional(),
        externalId: z.string().nullable().optional(),
        homeTeam: z.string().trim().min(1).max(60),
        awayTeam: z.string().trim().min(1).max(60),
        kickoffAt: z.string().min(1),
        status: z.enum(STATUSES as [MatchStatus, ...MatchStatus[]]),
        homeGoals: z.number().int().min(0).max(20).nullable(),
        awayGoals: z.number().int().min(0).max(20).nullable(),
      }),
    )
    .min(1)
    .max(20),
});

/**
 * Inserimento e correzione a mano.
 *
 * Passa dalla stessa `applyMatchday` del sync automatico, quindi il lock
 * viene calcolato con le stesse regole: è il motivo per cui il fallback
 * manuale non è una scorciatoia di serie B.
 */
export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: auth.status });
  }

  const parsed = manualSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dati non validi: controlla squadre, orari e risultati." },
      { status: 400 },
    );
  }

  const { season, number, matches } = parsed.data;

  const inputs: MatchInput[] = matches.map((m) => {
    const kickoff = new Date(m.kickoffAt);
    if (Number.isNaN(kickoff.getTime())) {
      throw new Error(`Data non valida: ${m.kickoffAt}`);
    }
    return {
      id: m.id ?? null,
      externalId: m.externalId ?? null,
      homeTeam: m.homeTeam,
      homeTeamShort: m.homeTeam,
      awayTeam: m.awayTeam,
      awayTeamShort: m.awayTeam,
      kickoffAt: kickoff.toISOString(),
      status: m.status,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
    };
  });

  const admin = serviceClient();

  try {
    const result = await applyMatchday(admin, {
      season,
      number,
      inputs,
      source: "manual",
    });

    await admin.from("audit_log").insert({
      actor_id: auth.session.playerId,
      action: "matchday.manual_save",
      entity: "matchday",
      entity_id: result.matchdayId,
      after: { season, number, count: inputs.length },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[/api/admin/matchday] salvataggio manuale fallito:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Salvataggio fallito." },
      { status: 500 },
    );
  }
}
