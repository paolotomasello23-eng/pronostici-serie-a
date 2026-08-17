import { describe, expect, it } from "vitest";
import { outcomeOf, scoreMatch, scoreMatches } from "@/lib/scoring";
import type { MatchScore, Prediction } from "@/lib/scoring";

const pred = (
  playerId: string,
  matchId: string,
  homeGoals: number,
  awayGoals: number,
): Prediction => ({ playerId, matchId, homeGoals, awayGoals });

const result = (matchId: string, homeGoals: number, awayGoals: number) => ({
  matchId,
  homeGoals,
  awayGoals,
});

const of = (scores: MatchScore[], playerId: string): MatchScore => {
  const found = scores.find((s) => s.playerId === playerId);
  if (!found) throw new Error(`Nessun punteggio per ${playerId}`);
  return found;
};

describe("outcomeOf", () => {
  it("deriva l'esito dal risultato", () => {
    expect(outcomeOf(2, 1)).toBe("1");
    expect(outcomeOf(1, 1)).toBe("X");
    expect(outcomeOf(0, 2)).toBe("2");
    expect(outcomeOf(0, 0)).toBe("X");
    expect(outcomeOf(5, 0)).toBe("1");
  });
});

describe("punti base", () => {
  // Due giocatori azzeccano l'esito: nessun bonus in gioco, così i punti
  // base si osservano puliti.
  const predictions = [
    pred("anna", "m1", 2, 1), // risultato esatto
    pred("bruno", "m1", 3, 1), // esito giusto, risultato sbagliato
    pred("carla", "m1", 1, 1), // esito sbagliato (X)
    pred("dario", "m1", 0, 2), // esito sbagliato (2)
  ];
  const scores = scoreMatch(result("m1", 2, 1), predictions);

  it("assegna 3 punti al risultato esatto", () => {
    const anna = of(scores, "anna");
    expect(anna.exact).toBe(true);
    expect(anna.outcomeCorrect).toBe(true);
    expect(anna.basePoints).toBe(3);
    expect(anna.points).toBe(3);
  });

  it("assegna 1 punto all'esito giusto con risultato sbagliato", () => {
    const bruno = of(scores, "bruno");
    expect(bruno.exact).toBe(false);
    expect(bruno.outcomeCorrect).toBe(true);
    expect(bruno.basePoints).toBe(1);
    expect(bruno.points).toBe(1);
  });

  it("assegna 0 punti a chi sbaglia l'esito", () => {
    expect(of(scores, "carla").points).toBe(0);
    expect(of(scores, "dario").points).toBe(0);
  });

  it("non somma mai 3 e 1: il risultato esatto vale 3, non 4", () => {
    expect(of(scores, "anna").basePoints).toBe(3);
  });

  it("vale anche sui pareggi", () => {
    const pareggi = scoreMatch(result("m1", 1, 1), [
      pred("anna", "m1", 1, 1), // esatto
      pred("bruno", "m1", 2, 2), // esito X giusto, risultato sbagliato
      pred("carla", "m1", 1, 0), // sbagliato
    ]);
    expect(of(pareggi, "anna").basePoints).toBe(3);
    expect(of(pareggi, "bruno").basePoints).toBe(1);
    expect(of(pareggi, "carla").basePoints).toBe(0);
  });
});

describe("bonus unico", () => {
  it("dà +1 a chi è l'unico con l'esito giusto: 1 + 1 = 2", () => {
    const scores = scoreMatch(result("m1", 2, 1), [
      pred("anna", "m1", 3, 1), // unico con esito 1, risultato sbagliato
      pred("bruno", "m1", 1, 1),
      pred("carla", "m1", 0, 1),
    ]);
    const anna = of(scores, "anna");
    expect(anna.basePoints).toBe(1);
    expect(anna.uniqueBonus).toBe(1);
    expect(anna.points).toBe(2);
  });

  it("si somma al risultato esatto: 3 + 1 = 4", () => {
    const scores = scoreMatch(result("m1", 2, 1), [
      pred("anna", "m1", 2, 1), // esatto e unico con esito 1
      pred("bruno", "m1", 1, 2),
      pred("carla", "m1", 1, 1),
      pred("dario", "m1", 0, 3),
    ]);
    const anna = of(scores, "anna");
    expect(anna.basePoints).toBe(3);
    expect(anna.uniqueBonus).toBe(1);
    expect(anna.points).toBe(4);
  });

  it("non scatta se in due azzeccano l'esito", () => {
    const scores = scoreMatch(result("m1", 2, 1), [
      pred("anna", "m1", 2, 1),
      pred("bruno", "m1", 3, 0),
      pred("carla", "m1", 1, 1),
    ]);
    expect(of(scores, "anna").uniqueBonus).toBe(0);
    expect(of(scores, "bruno").uniqueBonus).toBe(0);
    expect(of(scores, "anna").points).toBe(3);
    expect(of(scores, "bruno").points).toBe(1);
  });

  it("non scatta se nessuno azzecca l'esito", () => {
    const scores = scoreMatch(result("m1", 1, 1), [
      pred("anna", "m1", 2, 0),
      pred("bruno", "m1", 3, 1),
      pred("carla", "m1", 0, 2),
    ]);
    expect(scores.every((s) => s.uniqueBonus === 0)).toBe(true);
    expect(scores.every((s) => s.points === 0)).toBe(true);
  });

  it("non va a chi sbaglia l'esito, nemmeno se è l'unico a sbagliarlo", () => {
    const scores = scoreMatch(result("m1", 2, 1), [
      pred("anna", "m1", 2, 1),
      pred("bruno", "m1", 3, 0),
      pred("carla", "m1", 1, 1), // unico ad aver sbagliato
    ]);
    expect(of(scores, "carla").uniqueBonus).toBe(0);
    expect(of(scores, "carla").points).toBe(0);
  });

  describe("soglia minima di pronostici", () => {
    it("non scatta sotto i 3 pronostici sulla partita", () => {
      const scores = scoreMatch(result("m1", 2, 1), [
        pred("anna", "m1", 2, 1), // unico con l'esito giusto, ma sono solo in due
        pred("bruno", "m1", 1, 1),
      ]);
      expect(of(scores, "anna").uniqueBonus).toBe(0);
      expect(of(scores, "anna").points).toBe(3);
    });

    it("scatta esattamente a 3 pronostici", () => {
      const scores = scoreMatch(result("m1", 2, 1), [
        pred("anna", "m1", 2, 0),
        pred("bruno", "m1", 1, 1),
        pred("carla", "m1", 0, 1),
      ]);
      expect(of(scores, "anna").uniqueBonus).toBe(1);
      expect(of(scores, "anna").points).toBe(2);
    });

    it("conta solo i pronostici su QUELLA partita", () => {
      const scores = scoreMatch(result("m1", 2, 1), [
        pred("anna", "m1", 2, 1),
        pred("bruno", "m1", 1, 1),
        // Questi due sono su un'altra partita: non fanno numero.
        pred("carla", "m2", 1, 0),
        pred("dario", "m2", 0, 0),
      ]);
      expect(scores).toHaveLength(2);
      expect(of(scores, "anna").uniqueBonus).toBe(0);
    });

    it("rispetta una soglia diversa passata in configurazione", () => {
      const scores = scoreMatch(
        result("m1", 2, 1),
        [pred("anna", "m1", 2, 1), pred("bruno", "m1", 1, 1)],
        { uniqueBonusMinPredictions: 2 },
      );
      expect(of(scores, "anna").uniqueBonus).toBe(1);
      expect(of(scores, "anna").points).toBe(4);
    });
  });

  it("chi non ha pronosticato non compare e non fa numero", () => {
    const scores = scoreMatch(result("m1", 2, 1), [
      pred("anna", "m1", 2, 1),
      pred("bruno", "m1", 1, 1),
    ]);
    expect(scores).toHaveLength(2);
    expect(scores.map((s) => s.playerId)).not.toContain("carla");
  });
});

describe("validazione degli input", () => {
  it("rifiuta due pronostici dello stesso giocatore sulla stessa partita", () => {
    expect(() =>
      scoreMatch(result("m1", 2, 1), [
        pred("anna", "m1", 2, 1),
        pred("anna", "m1", 1, 0),
      ]),
    ).toThrow(/duplicato/i);
  });

  it("rifiuta risultati duplicati", () => {
    expect(() =>
      scoreMatches([result("m1", 2, 1), result("m1", 0, 0)], []),
    ).toThrow(/duplicato/i);
  });

  it("rifiuta gol negativi, non interi o assurdi", () => {
    expect(() => scoreMatch(result("m1", -1, 0), [])).toThrow(/non validi/i);
    expect(() => scoreMatch(result("m1", 1.5, 0), [])).toThrow(/non validi/i);
    expect(() => scoreMatch(result("m1", 99, 0), [])).toThrow(/non validi/i);
    expect(() =>
      scoreMatch(result("m1", 2, 1), [pred("anna", "m1", -2, 0)]),
    ).toThrow(/non validi/i);
  });
});

describe("scoreMatches", () => {
  const predictions = [
    pred("anna", "m1", 2, 1),
    pred("bruno", "m1", 1, 1),
    pred("carla", "m1", 0, 2),
    pred("anna", "m2", 0, 0),
    pred("bruno", "m2", 1, 0),
    pred("carla", "m2", 2, 2),
  ];

  it("valuta ogni partita in modo indipendente", () => {
    const scores = scoreMatches(
      [result("m1", 2, 1), result("m2", 0, 0)],
      predictions,
    );
    expect(scores).toHaveLength(6);

    const m1 = scores.filter((s) => s.matchId === "m1");
    expect(of(m1, "anna").points).toBe(4); // esatto + unico
    expect(of(m1, "bruno").points).toBe(0);
    expect(of(m1, "carla").points).toBe(0);

    const m2 = scores.filter((s) => s.matchId === "m2");
    expect(of(m2, "anna").points).toBe(3); // 0-0 esatto
    expect(of(m2, "bruno").points).toBe(0);
    expect(of(m2, "carla").points).toBe(1); // X giusto, risultato sbagliato
  });

  it("ignora le partite non ancora finite: chi non passa il risultato non prende punti", () => {
    // m2 non è finita, quindi il chiamante non la passa affatto.
    const scores = scoreMatches([result("m1", 2, 1)], predictions);
    expect(scores.every((s) => s.matchId === "m1")).toBe(true);
    expect(scores).toHaveLength(3);
  });

  it("è idempotente: ricalcolare non cambia nulla", () => {
    const first = scoreMatches([result("m1", 2, 1)], predictions);
    const second = scoreMatches([result("m1", 2, 1)], predictions);
    expect(second).toEqual(first);
  });

  it("non produce punti se non c'è nessun risultato", () => {
    expect(scoreMatches([], predictions)).toEqual([]);
  });
});
