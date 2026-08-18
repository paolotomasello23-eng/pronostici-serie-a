import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeLockAt,
  usableGoals,
  type MatchInput,
  type SourceKind,
} from "./types";

/**
 * Scrive nel database le partite di una giornata.
 *
 * È l'unico punto di scrittura del calendario, usato sia dal sync
 * automatico sia dall'inserimento manuale dell'admin. Tenerlo unico è ciò
 * che garantisce che il lock venga calcolato allo stesso modo comunque
 * arrivino i dati: se il fallback manuale avesse un suo percorso, sarebbe
 * proprio nel giorno in cui l'API non risponde che il lock si romperebbe.
 *
 * Richiede il client service_role: scrive dati che nessun giocatore può
 * toccare.
 */

export interface ApplyResult {
  matchdayId: string;
  inserted: number;
  updated: number;
  lockAt: string | null;
  lockedAlready: boolean;
}

export async function applyMatchday(
  admin: SupabaseClient,
  params: {
    season: number;
    number: number;
    inputs: readonly MatchInput[];
    source: SourceKind;
  },
): Promise<ApplyResult> {
  const { season, number, inputs, source } = params;

  const { data: existingDay } = await admin
    .from("matchdays")
    .select("id, lock_at, status")
    .eq("season", season)
    .eq("number", number)
    .maybeSingle();

  let matchdayId = existingDay?.id as string | undefined;

  if (!matchdayId) {
    const { data: created, error } = await admin
      .from("matchdays")
      .insert({ season, number, source, status: "draft" })
      .select("id")
      .single();
    if (error || !created) {
      throw new Error(`Impossibile creare la giornata ${number}: ${error?.message}`);
    }
    matchdayId = created.id as string;
  }

  // Una volta scattato il lock non si torna indietro: da qui in poi gli
  // aggiornamenti possono cambiare stati e risultati, mai la scadenza per
  // pronosticare. Se l'orario della prima partita cambiasse dopo il
  // fischio d'inizio, riaprire i pronostici sarebbe il modo più veloce di
  // rovinare la giornata a tutti.
  const previousLockAt = existingDay?.lock_at as string | null | undefined;
  const lockedAlready =
    !!previousLockAt && new Date(previousLockAt).getTime() <= Date.now();

  const { data: existingMatches } = await admin
    .from("matches")
    .select("id, external_id")
    .eq("matchday_id", matchdayId);

  const byExternalId = new Map<string, string>();
  for (const row of existingMatches ?? []) {
    if (row.external_id) byExternalId.set(String(row.external_id), row.id as string);
  }

  let inserted = 0;
  let updated = 0;

  for (const [index, input] of inputs.entries()) {
    const { homeGoals, awayGoals } = usableGoals(input);

    // Il database pretende che i gol esistano se e solo se lo stato è
    // FINISHED. Se una fonte dicesse "finita" senza dare il punteggio, la
    // trattiamo come ancora in corso invece di rifiutare tutto il sync.
    const status =
      input.status === "FINISHED" && homeGoals === null ? "IN_PLAY" : input.status;

    const row = {
      matchday_id: matchdayId,
      external_id: input.externalId,
      home_team: input.homeTeam,
      home_team_short: input.homeTeamShort,
      away_team: input.awayTeam,
      away_team_short: input.awayTeamShort,
      kickoff_at: input.kickoffAt,
      status,
      home_goals: homeGoals,
      away_goals: awayGoals,
      result_source: source,
      position: index + 1,
      updated_at: new Date().toISOString(),
    };

    const targetId =
      input.id ?? (input.externalId ? byExternalId.get(input.externalId) : undefined);

    if (targetId) {
      const { error } = await admin.from("matches").update(row).eq("id", targetId);
      if (error) throw new Error(`Aggiornamento partita fallito: ${error.message}`);
      updated++;
    } else {
      const { error } = await admin.from("matches").insert(row);
      if (error) throw new Error(`Inserimento partita fallito: ${error.message}`);
      inserted++;
    }
  }

  // Le partite già a database ma assenti da questo aggiornamento non
  // vengono cancellate: potrebbero avere pronostici collegati. Se ne resta
  // una di troppo, la toglie l'admin dal pannello, guardandola in faccia.

  const { data: allMatches } = await admin
    .from("matches")
    .select("kickoff_at, status")
    .eq("matchday_id", matchdayId);

  const lockAt = lockedAlready
    ? (previousLockAt ?? null)
    : computeLockAt(
        (allMatches ?? []).map((m) => ({
          externalId: null,
          homeTeam: "",
          homeTeamShort: "",
          awayTeam: "",
          awayTeamShort: "",
          kickoffAt: m.kickoff_at as string,
          status: m.status as MatchInput["status"],
          homeGoals: null,
          awayGoals: null,
        })),
      );

  const allFinished =
    (allMatches ?? []).length > 0 &&
    (allMatches ?? []).every((m) => m.status === "FINISHED");

  const dayStatus = allFinished
    ? "scored"
    : lockAt && new Date(lockAt).getTime() <= Date.now()
      ? "locked"
      : (allMatches ?? []).length > 0
        ? "open"
        : "draft";

  await admin
    .from("matchdays")
    .update({
      lock_at: lockAt,
      status: dayStatus,
      source,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", matchdayId);

  return { matchdayId, inserted, updated, lockAt, lockedAlready };
}

/** Traccia ogni sincronizzazione, per poterla ricostruire quando qualcosa non torna. */
export async function logSyncRun(
  admin: SupabaseClient,
  entry: {
    kind: string;
    matchdayId?: string | null;
    status: "ok" | "error";
    httpStatus?: number | null;
    message?: string | null;
  },
): Promise<void> {
  await admin.from("sync_runs").insert({
    kind: entry.kind,
    matchday_id: entry.matchdayId ?? null,
    status: entry.status,
    http_status: entry.httpStatus ?? null,
    message: entry.message ?? null,
    finished_at: new Date().toISOString(),
  });
}
