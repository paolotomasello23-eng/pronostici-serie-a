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
 *
 * Bonus controcorrente: ogni partita mette in palio 2 punti, che vanno a chi
 * ha azzeccato l'esito andando contro il gruppo.
 *
 *   1 solo indovina  ->  prende tutti e 2 i punti
 *   in 2 indovinano  ->  1 punto a testa
 *   in 3 o più       ->  niente: non è più andare controcorrente
 *
 * Il bonus si somma ai punti base: esatto da solo = 3 + 2 = 5, esito
 * azzeccato in due = 1 + 1 = 2.
 *
 * Dipende dai pronostici di tutti, quindi si può calcolare solo lato server
 * e solo dopo che il risultato è noto.
 */

/** Punti messi in palio da ogni partita per il bonus controcorrente. */
const BONUS_POOL = 2;

/** Oltre questo numero di indovini il bonus non viene assegnato a nessuno. */
const MAX_BONUS_WINNERS = 2;

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

  // I 2 punti in palio si dividono fra chi ha indovinato, ma solo se sono
  // pochi: in tre non si va più controcorrente, si va con la maggioranza.
  // La soglia sui pronostici serve a che il "pochi" sia un merito e non
  // l'effetto di una partita che quasi nessuno ha compilato.
  const bonusEach =
    relevant.length >= config.uniqueBonusMinPredictions &&
    correctOutcomeCount >= 1 &&
    correctOutcomeCount <= MAX_BONUS_WINNERS
      ? BONUS_POOL / correctOutcomeCount
      : 0;

  return relevant.map((p) => {
    const outcomeCorrect = outcomeOf(p.homeGoals, p.awayGoals) === actualOutcome;
    const exact =
      p.homeGoals === result.homeGoals && p.awayGoals === result.awayGoals;

    const basePoints = exact ? 3 : outcomeCorrect ? 1 : 0;
    const uniqueBonus = outcomeCorrect ? bonusEach : 0;

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
