import { describe, expect, it } from "vitest";
import { computeStandings, scoreMatches } from "@/lib/scoring";
import type { MatchResult, PlayerRef, Prediction } from "@/lib/scoring";

/**
 * Test "golden": una giornata intera, quattro giocatori, conti fatti a mano.
 *
 * Se un giorno cambiamo il motore e questo test si rompe, vuol dire che
 * abbiamo cambiato le regole del gioco — non che il test è vecchio.
 *
 * TABELLA DI VERIFICA (calcolata a mano, riga per riga)
 *
 * Bonus: 2 punti in palio per partita, a chi azzecca andando controcorrente.
 * Uno solo indovina -> 2 punti a lui. In due -> 1 a testa. In tre -> niente.
 *
 * m1  2-1 (1) | Anna 2-1 esatto=3+1 | Bruno 1-0 esito=1+1 | Carla 1-1 =0 | Dario 0-1 =0
 *             -> azzeccano in due: 1 punto di bonus a testa
 * m2  0-0 (X) | Anna 1-0 =0 | Bruno 0-0 esatto+2=5 | Carla 2-1 =0 | Dario 1-2 =0
 * m3  1-3 (2) | Anna 0-2 =1 | Bruno 1-2 =1 | Carla 0-1 =1 | Dario 2-0 =0
 *             -> azzeccano in tre: niente bonus
 * m4  2-2 (X) | Anna 1-1 esito+2=3 | Bruno 2-1 =0 | Carla 0-2 =0 | Dario 3-1 =0
 * m5  1-0 (1) | Anna 2-0 =1 | Bruno 1-0 esatto=3 | Carla 1-0 esatto=3 | Dario 0-0 =0
 *             -> azzeccano in tre: niente bonus
 * m6  0-2 (2) | Anna 0-1 =1+1 | Bruno 1-1 =0 | Carla 2-1 =0 | Dario 0-2 esatto=3+1
 * m7  3-1 (1) | Anna 1-2 =0 | Bruno 0-1 =0 | Carla 3-1 esatto+2=5 | Dario 1-1 =0
 * m8  1-1 (X) | Anna 1-1 esatto=3 | Bruno 2-2 =1 | Carla 1-0 =0 | Dario 0-0 =1
 *             -> azzeccano in tre: niente bonus
 * m9  0-1 (2) | Anna 0-1 esatto=3 | Bruno 1-0 =0 | Carla e Dario non pronosticano
 *             -> solo 2 pronostici: sotto la soglia, Anna NON prende il bonus
 * m10 RINVIATA -> nessun punto, anche se tutti hanno pronosticato
 *
 * TOTALI  Anna 17 (7 esiti, 3 esatti) | Bruno 12 (5, 2)
 *         Carla 9 (3, 2)              | Dario 5 (2, 1)
 */

const PLAYERS: PlayerRef[] = [
  { playerId: "anna", displayName: "Anna" },
  { playerId: "bruno", displayName: "Bruno" },
  { playerId: "carla", displayName: "Carla" },
  { playerId: "dario", displayName: "Dario" },
];

const p = (
  playerId: string,
  matchId: string,
  homeGoals: number,
  awayGoals: number,
): Prediction => ({ playerId, matchId, homeGoals, awayGoals });

const PREDICTIONS: Prediction[] = [
  p("anna", "m1", 2, 1), p("bruno", "m1", 1, 0), p("carla", "m1", 1, 1), p("dario", "m1", 0, 1),
  p("anna", "m2", 1, 0), p("bruno", "m2", 0, 0), p("carla", "m2", 2, 1), p("dario", "m2", 1, 2),
  p("anna", "m3", 0, 2), p("bruno", "m3", 1, 2), p("carla", "m3", 0, 1), p("dario", "m3", 2, 0),
  p("anna", "m4", 1, 1), p("bruno", "m4", 2, 1), p("carla", "m4", 0, 2), p("dario", "m4", 3, 1),
  p("anna", "m5", 2, 0), p("bruno", "m5", 1, 0), p("carla", "m5", 1, 0), p("dario", "m5", 0, 0),
  p("anna", "m6", 0, 1), p("bruno", "m6", 1, 1), p("carla", "m6", 2, 1), p("dario", "m6", 0, 2),
  p("anna", "m7", 1, 2), p("bruno", "m7", 0, 1), p("carla", "m7", 3, 1), p("dario", "m7", 1, 1),
  p("anna", "m8", 1, 1), p("bruno", "m8", 2, 2), p("carla", "m8", 1, 0), p("dario", "m8", 0, 0),
  // m9: Carla e Dario si sono dimenticati.
  p("anna", "m9", 0, 1), p("bruno", "m9", 1, 0),
  // m10: pronosticata da tutti, ma la partita è stata rinviata.
  p("anna", "m10", 1, 0), p("bruno", "m10", 2, 1), p("carla", "m10", 0, 0), p("dario", "m10", 1, 1),
];

/** Le 9 partite effettivamente concluse. La m10 è rinviata e manca all'appello. */
const FINISHED: MatchResult[] = [
  { matchId: "m1", homeGoals: 2, awayGoals: 1 },
  { matchId: "m2", homeGoals: 0, awayGoals: 0 },
  { matchId: "m3", homeGoals: 1, awayGoals: 3 },
  { matchId: "m4", homeGoals: 2, awayGoals: 2 },
  { matchId: "m5", homeGoals: 1, awayGoals: 0 },
  { matchId: "m6", homeGoals: 0, awayGoals: 2 },
  { matchId: "m7", homeGoals: 3, awayGoals: 1 },
  { matchId: "m8", homeGoals: 1, awayGoals: 1 },
  { matchId: "m9", homeGoals: 0, awayGoals: 1 },
];

describe("giornata completa", () => {
  const scores = scoreMatches(FINISHED, PREDICTIONS);
  const standings = computeStandings(scores, PLAYERS);

  it("produce la classifica attesa, calcolata a mano", () => {
    expect(
      standings.map((r) => [r.displayName, r.points, r.outcomeCount, r.exactCount]),
    ).toEqual([
      ["Anna", 17, 7, 3],
      ["Bruno", 12, 5, 2],
      ["Carla", 9, 3, 2],
      ["Dario", 5, 2, 1],
    ]);
  });

  it("assegna 43 punti in totale sulla giornata", () => {
    const total = scores.reduce((sum, s) => sum + s.points, 0);
    expect(total).toBe(43);
  });

  it("non assegna punti per la partita rinviata", () => {
    expect(scores.some((s) => s.matchId === "m10")).toBe(false);
  });

  it("nega il bonus sulla m9, dove hanno pronosticato in due soli", () => {
    const m9 = scores.filter((s) => s.matchId === "m9");
    expect(m9).toHaveLength(2);
    const anna = m9.find((s) => s.playerId === "anna");
    expect(anna?.exact).toBe(true);
    expect(anna?.uniqueBonus).toBe(0);
    expect(anna?.points).toBe(3);
  });

  it("conta le partite giocate da ciascuno", () => {
    // Carla e Dario hanno saltato la m9.
    expect(standings.map((r) => r.scoredMatches)).toEqual([9, 9, 8, 8]);
  });
});

describe("recupero della partita rinviata", () => {
  // La m10 si gioca il mercoledì dopo e finisce 2-0.
  // Anna (1-0) e Bruno (2-1) azzeccano l'esito 1: in due, quindi niente bonus.
  const recovered: MatchResult[] = [
    ...FINISHED,
    { matchId: "m10", homeGoals: 2, awayGoals: 0 },
  ];

  it("aggiunge i punti senza toccare quelli già assegnati", () => {
    const before = scoreMatches(FINISHED, PREDICTIONS);
    const after = scoreMatches(recovered, PREDICTIONS);

    // Tutti i punteggi precedenti sopravvivono identici al ricalcolo.
    for (const score of before) {
      expect(after).toContainEqual(score);
    }

    const standings = computeStandings(after, PLAYERS);
    expect(
      standings.map((r) => [r.displayName, r.points, r.outcomeCount]),
    ).toEqual([
      ["Anna", 19, 8],
      ["Bruno", 14, 6],
      ["Carla", 9, 3],
      ["Dario", 5, 2],
    ]);
  });
});
