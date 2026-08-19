/**
 * Tipi del motore di punteggio.
 *
 * Volutamente slegati dal database: il motore è una funzione pura che non sa
 * nulla di Supabase, di HTTP o di football-data. Riceve numeri, restituisce
 * numeri. È l'unico modo per poterlo testare davvero.
 */

/** Esito di una partita: 1 = casa, X = pareggio, 2 = trasferta. */
export type Outcome = "1" | "X" | "2";

/** Risultato finale di una partita già giocata (status FINISHED). */
export interface MatchResult {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
}

/** Pronostico di un giocatore su una partita. */
export interface Prediction {
  playerId: string;
  matchId: string;
  homeGoals: number;
  awayGoals: number;
}

/** Punteggio di un giocatore su una singola partita. */
export interface MatchScore {
  playerId: string;
  matchId: string;
  /** Ha azzeccato 1/X/2 (indipendentemente dal risultato esatto). */
  outcomeCorrect: boolean;
  /** Ha azzeccato entrambi i gol. */
  exact: boolean;
  /** 3 se esatto, 1 se solo l'esito, 0 altrimenti. Mai la somma dei due. */
  basePoints: number;
  /**
   * Bonus controcorrente: 2 se è stato l'unico ad azzeccare l'esito, 1 se
   * in due, 0 se in tre o più (o sotto la soglia di pronostici).
   */
  uniqueBonus: number;
  /** basePoints + uniqueBonus. */
  points: number;
}

export interface ScoringConfig {
  /**
   * Numero minimo di pronostici sulla partita perché il bonus controcorrente
   * possa essere assegnato. Serve a evitare che chi è l'unico ad aver
   * compilato quella riga incassi il bonus a tavolino.
   */
  uniqueBonusMinPredictions: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  uniqueBonusMinPredictions: 3,
};

/** Anagrafica minima per costruire la classifica. */
export interface PlayerRef {
  playerId: string;
  displayName: string;
}

/** Riga di classifica, generale o di giornata. */
export interface StandingsRow {
  playerId: string;
  displayName: string;
  points: number;
  /** Numero di esiti 1/X/2 azzeccati: primo spareggio. */
  outcomeCount: number;
  /** Numero di risultati esatti: secondo spareggio. */
  exactCount: number;
  /** Punti presi col bonus controcorrente, mostrati accanto agli altri conteggi. */
  bonusPoints: number;
  /** Partite effettivamente pronosticate e già valutate. */
  scoredMatches: number;
  /**
   * Posizione in classifica. A parità di tutti e tre i criteri sportivi la
   * posizione è condivisa (1, 2, 2, 4): l'ordine alfabetico decide come
   * vengono mostrati, non chi sta davvero davanti.
   */
  rank: number;
}
