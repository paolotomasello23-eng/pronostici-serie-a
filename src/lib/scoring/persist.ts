import type { SupabaseClient } from "@supabase/supabase-js";
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
  /** Tutte le partite sono finite: la giornata è chiusa. */
  complete: boolean;
}

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

  const config: ScoringConfig = {
    uniqueBonusMinPredictions: league.unique_bonus_min_predictions as number,
  };

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

  // I pronostici non appartengono più a una lega: sono della persona. Per
  // questa classifica contano solo quelli dei suoi membri — e il filtro non
  // è cosmetico, perché il bonus controcorrente si calcola su quanti hanno
  // azzeccato *dentro questa lega*.
  const { data: membri } = await admin
    .from("league_members")
    .select("player_id")
    .eq("league_id", leagueId);

  const iscritti = new Set((membri ?? []).map((m) => m.player_id as string));

  const { data: rows, error: predictionsError } = matchIds.length
    ? await admin
        .from("predictions")
        .select("player_id, match_id, home_goals, away_goals")
        .in("match_id", matchIds)
    : { data: [], error: null };

  if (predictionsError) {
    throw new Error(`Pronostici non leggibili: ${predictionsError.message}`);
  }

  const predictions: Prediction[] = (rows ?? [])
    .filter((p) => iscritti.has(p.player_id as string))
    .map((p) => ({
    playerId: p.player_id as string,
    matchId: p.match_id as string,
    homeGoals: p.home_goals as number,
    awayGoals: p.away_goals as number,
  }));

  const scores = scoreMatches(results, predictions, config);

  const { data: inserted, error: rpcError } = await admin.rpc(
    "replace_matchday_scores",
    {
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
    },
  );

  if (rpcError) throw new Error(`Scrittura punteggi fallita: ${rpcError.message}`);

  const complete = all.length > 0 && results.length === all.length;

  // 'scored' solo quando non manca più niente: se una partita è ancora da
  // recuperare, la giornata resta 'locked' e i punti si aggiungeranno dopo.
  await admin
    .from("matchdays")
    .update({ status: complete ? "scored" : "locked" })
    .eq("id", matchdayId);

  return {
    matchdayId,
    finishedMatches: results.length,
    totalMatches: all.length,
    scoredRows: (inserted as number | null) ?? scores.length,
    complete,
  };
}
