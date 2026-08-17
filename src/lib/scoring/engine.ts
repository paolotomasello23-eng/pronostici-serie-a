import {
  DEFAULT_SCORING_CONFIG,
  type MatchResult,
  type MatchScore,
  type Outcome,
  type Prediction,
  type ScoringConfig,
} from "./types";

/**
 * Regole del gioco, in un posto solo:
 *
 *   +3  risultato esatto (gol casa e gol trasferta entrambi corretti)
 *   +1  esito 1/X/2 corretto ma risultato sbagliato
 *   +1  bonus se è l'UNICO della lega ad aver azzeccato l'esito di quel match
 *       (il bonus si somma: esito unico = 2, esatto e unico = 4)
 *
 * Il bonus dipende dai pronostici di tutti, quindi si può calcolare solo lato
 * server e solo dopo che il risultato è noto.
 */

export function outcomeOf(homeGoals: number, awayGoals: number): Outcome {
  if (homeGoals > awayGoals) return "1";
  if (homeGoals === awayGoals) return "X";
  return "2";
}

function assertGoals(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 20) {
    throw new Error(
      `Gol non validi per ${label}: ${value}. Ammessi solo interi tra 0 e 20.`,
    );
  }
}

/**
 * Calcola i punteggi di TUTTI i giocatori su UNA partita.
 *
 * Va chiamata solo per partite con status FINISHED: una partita in corso,
 * rinviata o sospesa non deve produrre punti, e filtrarle è responsabilità
 * del chiamante.
 *
 * I pronostici passati possono riguardare anche altre partite: vengono
 * filtrati qui. Restituisce una riga per ogni giocatore che ha pronosticato
 * questa partita, nell'ordine in cui è arrivata; chi non ha pronosticato non
 * compare (zero punti impliciti) e non conta per il bonus.
 */
export function scoreMatch(
  result: MatchResult,
  predictions: readonly Prediction[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): MatchScore[] {
  assertGoals(result.homeGoals, `risultato della partita ${result.matchId} (casa)`);
  assertGoals(result.awayGoals, `risultato della partita ${result.matchId} (trasferta)`);

  const relevant = predictions.filter((p) => p.matchId === result.matchId);

  const seen = new Set<string>();
  for (const p of relevant) {
    if (seen.has(p.playerId)) {
      throw new Error(
        `Pronostico duplicato: il giocatore ${p.playerId} ha più di un pronostico sulla partita ${p.matchId}.`,
      );
    }
    seen.add(p.playerId);
    assertGoals(p.homeGoals, `pronostico di ${p.playerId} su ${p.matchId} (casa)`);
    assertGoals(p.awayGoals, `pronostico di ${p.playerId} su ${p.matchId} (trasferta)`);
  }

  const actualOutcome = outcomeOf(result.homeGoals, result.awayGoals);

  const correctOutcomeCount = relevant.filter(
    (p) => outcomeOf(p.homeGoals, p.awayGoals) === actualOutcome,
  ).length;

  // Il bonus esiste solo se uno solo ha indovinato l'esito E la partita ha
  // abbastanza pronostici da rendere il "solo" un merito e non un caso.
  const bonusAvailable =
    correctOutcomeCount === 1 &&
    relevant.length >= config.uniqueBonusMinPredictions;

  return relevant.map((p) => {
    const outcomeCorrect = outcomeOf(p.homeGoals, p.awayGoals) === actualOutcome;
    const exact =
      p.homeGoals === result.homeGoals && p.awayGoals === result.awayGoals;

    const basePoints = exact ? 3 : outcomeCorrect ? 1 : 0;
    const uniqueBonus = outcomeCorrect && bonusAvailable ? 1 : 0;

    return {
      playerId: p.playerId,
      matchId: p.matchId,
      outcomeCorrect,
      exact,
      basePoints,
      uniqueBonus,
      points: basePoints + uniqueBonus,
    };
  });
}

/**
 * Calcola i punteggi su più partite.
 *
 * Ogni partita è indipendente dalle altre: questo è ciò che permette di
 * assegnare i punti man mano che le partite finiscono, senza aspettare che
 * l'intera giornata sia conclusa. Una partita rinviata al mercoledì non
 * blocca la classifica del lunedì, e quando finirà i suoi punti si
 * aggiungeranno senza toccare quelli già assegnati.
 */
export function scoreMatches(
  results: readonly MatchResult[],
  predictions: readonly Prediction[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): MatchScore[] {
  const seen = new Set<string>();
  for (const r of results) {
    if (seen.has(r.matchId)) {
      throw new Error(`Risultato duplicato per la partita ${r.matchId}.`);
    }
    seen.add(r.matchId);
  }

  return results.flatMap((result) => scoreMatch(result, predictions, config));
}
