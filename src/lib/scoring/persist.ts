import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { scoreMatches } from "./engine";
import type { MatchResult, Prediction, ScoringConfig } from "./types";

/**
 * Il ponte tra il database e il motore di punteggio.
 *
 * Il motore resta quello di sempre: funzioni pure che non sanno cosa sia
 * Supabase. Qui si leggono i dati, si passano al motore, e si riscrive il
 * risultato. Nessuna regola di gioco vive in questo file — se ci finisse,
 * sfuggirebbe ai test che la coprono.
 *
 * Volutamente senza `server-only`: riceve il client dall'esterno e non
 * tocca variabili d'ambiente, così è richiamabile dai test di integrazione.
 */

export interface RecomputeResult {
  matchdayId: string;
  /** Partite concluse e quindi valutate. */
  finishedMatches: number;
  /** Partite totali della giornata. */
  totalMatches: number;
  /** Righe di punteggio scritte. */
  scoredRows: number;
  /** Non c'è più niente da aspettare: la giornata è chiusa. */
  complete: boolean;
}

export interface RecomputeAllResult extends RecomputeResult {
  /** Le leghe ricalcolate, nell'ordine in cui sono state scritte. */
  leagueIds: string[];
}

/**
 * Stati da cui una partita non tornerà più: finita, oppure annullata.
 *
 * Un'annullata non produce punti, ma non va nemmeno aspettata — altrimenti
 * la giornata resterebbe aperta per sempre, la notifica dei risultati non
 * partirebbe mai e il controllo automatico continuerebbe a ripassarci sopra.
 * Una rinviata o una sospesa invece si giocherà: quelle si aspettano.
 */
const FINAL_STATUSES = ["FINISHED", "CANCELLED"];

interface MatchdayData {
  lockAt: string | null;
  totalMatches: number;
  results: MatchResult[];
  /** I pronostici di tutti, non ancora filtrati per lega. */
  predictions: Prediction[];
  complete: boolean;
}

async function loadMatchday(
  admin: SupabaseClient,
  matchdayId: string,
): Promise<MatchdayData> {
  const { data: day, error: dayError } = await admin
    .from("matchdays")
    .select("lock_at")
    .eq("id", matchdayId)
    .maybeSingle();

  if (dayError) throw new Error(`Giornata non leggibile: ${dayError.message}`);

  const { data: matches, error: matchesError } = await admin
    .from("matches")
    .select("id, status, home_goals, away_goals")
    .eq("matchday_id", matchdayId);

  if (matchesError) throw new Error(`Partite non leggibili: ${matchesError.message}`);

  const all = matches ?? [];

  // Solo le partite finite producono punti. Una rinviata o una in corso
  // semplicemente non entra: i suoi pronostici restano lì, in attesa.
  const results: MatchResult[] = all
    .filter(
      (m) =>
        m.status === "FINISHED" && m.home_goals !== null && m.away_goals !== null,
    )
    .map((m) => ({
      matchId: m.id as string,
      homeGoals: m.home_goals as number,
      awayGoals: m.away_goals as number,
    }));

  const matchIds = all.map((m) => m.id as string);

  // Tutte le pagine: con molti iscritti all'app i pronostici di una sola
  // giornata superano facilmente le 1000 righe che Supabase restituisce
  // per richiesta, e quelli tagliati fuori varrebbero zero senza avviso.
  const rows = matchIds.length
    ? await fetchAll<Record<string, unknown>>((from, to) =>
        admin
          .from("predictions")
          .select("id, player_id, match_id, home_goals, away_goals")
          .in("match_id", matchIds)
          .order("id")
          .range(from, to),
      ).catch((error: Error) => {
        throw new Error(`Pronostici non leggibili: ${error.message}`);
      })
    : [];

  const predictions: Prediction[] = rows.map((p) => ({
    playerId: p.player_id as string,
    matchId: p.match_id as string,
    homeGoals: p.home_goals as number,
    awayGoals: p.away_goals as number,
  }));

  const complete =
    all.length > 0 &&
    all.every(
      (m) =>
        FINAL_STATUSES.includes(m.status as string) &&
        (m.status !== "FINISHED" || (m.home_goals !== null && m.away_goals !== null)),
    );

  return {
    lockAt: (day?.lock_at as string | null | undefined) ?? null,
    totalMatches: all.length,
    results,
    predictions,
    complete,
  };
}

async function writeLeagueScores(
  admin: SupabaseClient,
  params: {
    leagueId: string;
    matchdayId: string;
    config: ScoringConfig;
    members: ReadonlySet<string>;
    data: MatchdayData;
  },
): Promise<number> {
  const { leagueId, matchdayId, config, members, data } = params;

  // I pronostici non appartengono più a una lega: sono della persona. Per
  // questa classifica contano solo quelli dei suoi membri — e il filtro non
  // è cosmetico, perché il bonus controcorrente si calcola su quanti hanno
  // azzeccato *dentro questa lega*.
  const predictions = data.predictions.filter((p) => members.has(p.playerId));
  const scores = scoreMatches(data.results, predictions, config);

  const { data: inserted, error } = await admin.rpc("replace_matchday_scores", {
    p_league_id: leagueId,
    p_matchday_id: matchdayId,
    p_scores: scores.map((s) => ({
      player_id: s.playerId,
      match_id: s.matchId,
      outcome_correct: s.outcomeCorrect,
      exact: s.exact,
      base_points: s.basePoints,
      unique_bonus: s.uniqueBonus,
      points: s.points,
    })),
  });

  if (error) throw new Error(`Scrittura punteggi fallita: ${error.message}`);

  return (inserted as number | null) ?? scores.length;
}

async function loadMembers(
  admin: SupabaseClient,
  leagueId?: string,
): Promise<Map<string, Set<string>>> {
  const rows = await fetchAll<Record<string, unknown>>((from, to) => {
    let query = admin.from("league_members").select("league_id, player_id");
    if (leagueId) query = query.eq("league_id", leagueId);
    return query.order("league_id").order("player_id").range(from, to);
  }).catch((error: Error) => {
    // Un errore qui non può diventare "nessun iscritto": riscriverebbe la
    // giornata a zero punti per tutti.
    throw new Error(`Iscritti non leggibili: ${error.message}`);
  });

  const byLeague = new Map<string, Set<string>>();
  for (const row of rows) {
    const id = row.league_id as string;
    if (!byLeague.has(id)) byLeague.set(id, new Set());
    byLeague.get(id)!.add(row.player_id as string);
  }
  return byLeague;
}

/**
 * Ricalcola una giornata per una lega sola.
 *
 * Non tocca lo stato della giornata: il calendario è comune a tutte le
 * leghe, e dichiarare "chiusa" una giornata dopo averne ricalcolata una
 * sola farebbe saltare il ricalcolo delle altre. Per quello c'è
 * `recomputeMatchdayAllLeagues`.
 */
export async function recomputeMatchday(
  admin: SupabaseClient,
  params: { leagueId: string; matchdayId: string },
): Promise<RecomputeResult> {
  const { leagueId, matchdayId } = params;

  const { data: league, error: leagueError } = await admin
    .from("leagues")
    .select("unique_bonus_min_predictions")
    .eq("id", leagueId)
    .single();

  if (leagueError || !league) {
    throw new Error(`Lega non trovata: ${leagueError?.message ?? leagueId}`);
  }

  const data = await loadMatchday(admin, matchdayId);
  const members = (await loadMembers(admin, leagueId)).get(leagueId) ?? new Set();

  const scoredRows = await writeLeagueScores(admin, {
    leagueId,
    matchdayId,
    config: {
      uniqueBonusMinPredictions: league.unique_bonus_min_predictions as number,
    },
    members,
    data,
  });

  return {
    matchdayId,
    finishedMatches: data.results.length,
    totalMatches: data.totalMatches,
    scoredRows,
    complete: data.complete,
  };
}

/**
 * Ricalcola una giornata per tutte le leghe, e solo alla fine ne aggiorna
 * lo stato.
 *
 * È la strada da usare ogni volta che cambia un risultato: il calendario è
 * uno solo, e una correzione che arrivasse in una lega e non nelle altre
 * darebbe classifiche diverse per la stessa partita.
 *
 * 'scored' viene scritto qui e da nessun'altra parte, perché è il segnale
 * con cui il controllo automatico smette di guardare la giornata: va dato
 * soltanto quando tutte le leghe hanno davvero i loro punti.
 */
export async function recomputeMatchdayAllLeagues(
  admin: SupabaseClient,
  matchdayId: string,
): Promise<RecomputeAllResult> {
  const leagues = await fetchAll<Record<string, unknown>>((from, to) =>
    admin
      .from("leagues")
      .select("id, unique_bonus_min_predictions")
      .order("id")
      .range(from, to),
  );

  const data = await loadMatchday(admin, matchdayId);
  const members = await loadMembers(admin);

  let scoredRows = 0;
  const leagueIds: string[] = [];

  for (const league of leagues) {
    const leagueId = league.id as string;
    scoredRows += await writeLeagueScores(admin, {
      leagueId,
      matchdayId,
      config: {
        uniqueBonusMinPredictions: league.unique_bonus_min_predictions as number,
      },
      members: members.get(leagueId) ?? new Set(),
      data,
    });
    leagueIds.push(leagueId);
  }

  // Lo stato si tocca solo a giornata cominciata: prima del blocco non c'è
  // niente da chiudere, e 'locked' su una giornata ancora aperta sarebbe
  // semplicemente falso.
  const started = !!data.lockAt && new Date(data.lockAt).getTime() <= Date.now();
  if (started) {
    const { error } = await admin
      .from("matchdays")
      .update({ status: data.complete ? "scored" : "locked" })
      .eq("id", matchdayId);
    if (error) throw new Error(`Stato della giornata non aggiornato: ${error.message}`);
  }

  return {
    matchdayId,
    finishedMatches: data.results.length,
    totalMatches: data.totalMatches,
    scoredRows,
    complete: data.complete,
    leagueIds,
  };
}
