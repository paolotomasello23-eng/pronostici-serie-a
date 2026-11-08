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
  /** Qualche partita è nuova, o ha cambiato stato o risultato. */
  resultsChanged: boolean;
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

  const { data: existingDay, error: dayError } = await admin
    .from("matchdays")
    .select("id, lock_at, status")
    .eq("season", season)
    .eq("number", number)
    .maybeSingle();

  if (dayError) throw new Error(`Giornata non leggibile: ${dayError.message}`);

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

  const { data: existingMatches, error: existingError } = await admin
    .from("matches")
    .select("id, external_id, status, home_goals, away_goals")
    .eq("matchday_id", matchdayId);

  if (existingError) {
    throw new Error(`Partite esistenti non leggibili: ${existingError.message}`);
  }

  const byExternalId = new Map<string, string>();
  const before = new Map<string, string>();
  for (const row of existingMatches ?? []) {
    if (row.external_id) byExternalId.set(String(row.external_id), row.id as string);
    before.set(row.id as string, `${row.status}|${row.home_goals}|${row.away_goals}`);
  }

  let inserted = 0;
  let updated = 0;
  // Se qualche risultato cambia, i punti vanno rifatti: lo diciamo a chi
  // chiama lasciando la giornata da ricalcolare invece che "chiusa".
  let resultsChanged = false;

  for (const [index, input] of inputs.entries()) {
    const { homeGoals, awayGoals } = usableGoals(input);

    // Il database pretende che i gol esistano se e solo se lo stato è
    // FINISHED. Se una fonte dicesse "finita" senza dare il punteggio, la
    // trattiamo come ancora in corso invece di rifiutare tutto il sync.
    const status =
      input.status === "FINISHED" && homeGoals === null ? "IN_PLAY" : input.status;

    const row: Record<string, unknown> = {
      matchday_id: matchdayId,
      external_id: input.externalId,
      home_team: input.homeTeam,
      home_team_short: input.homeTeamShort,
      away_team: input.awayTeam,
      away_team_short: input.awayTeamShort,
      home_team_crest: input.homeTeamCrest ?? null,
      away_team_crest: input.awayTeamCrest ?? null,
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
      // Una correzione manuale non porta con sé gli stemmi: se li scrivessimo
      // comunque, un ritocco all'orario cancellerebbe i loghi già scaricati
      // dall'API. Quando mancano, si lascia stare quello che c'è.
      if (!input.homeTeamCrest) delete row.home_team_crest;
      if (!input.awayTeamCrest) delete row.away_team_crest;

      const { error } = await admin.from("matches").update(row).eq("id", targetId);
      if (error) throw new Error(`Aggiornamento partita fallito: ${error.message}`);
      if (before.get(targetId) !== `${status}|${homeGoals}|${awayGoals}`) {
        resultsChanged = true;
      }
      updated++;
    } else {
      const { error } = await admin.from("matches").insert(row);
      if (error) throw new Error(`Inserimento partita fallito: ${error.message}`);
      resultsChanged = true;
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

  // 'scored' non si assegna mai da qui: vuol dire "punti già calcolati per
  // tutte le leghe", e questa funzione scrive il calendario, non i punti.
  // Quando lo faceva, bastava che il sync del calendario passasse prima del
  // controllo dei risultati perché la giornata risultasse chiusa senza che
  // nessuno avesse assegnato i punti delle ultime partite — e il controllo
  // non ci tornava più sopra.
  //
  // Se invece era già chiusa e non è cambiato niente, resta chiusa: niente
  // ricalcoli e niente notifiche a vuoto a ogni passaggio del calendario.
  const previousStatus = existingDay?.status as string | undefined;
  const dayStatus =
    previousStatus === "scored" && !resultsChanged
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

  return { matchdayId, inserted, updated, lockAt, lockedAlready, resultsChanged };
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
