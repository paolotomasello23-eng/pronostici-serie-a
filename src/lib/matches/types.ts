/**
 * La forma normalizzata di una partita, indipendente da dove arriva.
 *
 * È il punto in cui football-data e l'inserimento manuale dell'admin
 * diventano la stessa cosa: da qui in giù il codice non sa più, e non deve
 * sapere, quale delle due fonti ha prodotto i dati. Se un domani l'API
 * chiudesse i battenti, basterebbe scrivere un'altra funzione che restituisce
 * questi oggetti.
 */

export type MatchStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "POSTPONED"
  | "SUSPENDED"
  | "CANCELLED";

/** Stati in cui una partita non ha una data attendibile per il lock. */
export const OFF_CALENDAR: readonly MatchStatus[] = ["POSTPONED", "CANCELLED"];

export interface MatchInput {
  /** Riga già esistente da aggiornare. Assente quando la partita è nuova. */
  id?: string | null;
  /** Id football-data, oppure null se la partita è stata inserita a mano. */
  externalId: string | null;
  homeTeam: string;
  homeTeamShort: string;
  awayTeam: string;
  awayTeamShort: string;
  /** ISO 8601 in UTC. */
  kickoffAt: string;
  status: MatchStatus;
  homeGoals: number | null;
  awayGoals: number | null;
}

export type SourceKind = "api" | "manual";

/**
 * Il risultato conta solo se la partita è finita. Un 1-0 al 40' non è un
 * risultato: è una fotografia. Il database ha lo stesso vincolo, questa è
 * la stessa regola scritta dove il codice la può applicare prima.
 */
export function usableGoals(input: MatchInput): {
  homeGoals: number | null;
  awayGoals: number | null;
} {
  if (input.status !== "FINISHED") return { homeGoals: null, awayGoals: null };
  if (input.homeGoals === null || input.awayGoals === null) {
    return { homeGoals: null, awayGoals: null };
  }
  return { homeGoals: input.homeGoals, awayGoals: input.awayGoals };
}

/**
 * Il momento in cui la giornata si blocca: il calcio d'inizio della prima
 * partita che si gioca davvero. Le rinviate non contano, altrimenti una
 * partita spostata a mercoledì terrebbe aperti i pronostici di tutti.
 */
export function computeLockAt(inputs: readonly MatchInput[]): string | null {
  const kickoffs = inputs
    .filter((m) => !OFF_CALENDAR.includes(m.status))
    .map((m) => m.kickoffAt)
    .sort();
  return kickoffs[0] ?? null;
}
