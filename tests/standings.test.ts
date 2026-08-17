import { describe, expect, it } from "vitest";
import { computeStandings } from "@/lib/scoring";
import type { MatchScore, PlayerRef } from "@/lib/scoring";

/** Risultato esatto: 3 punti, +1 se `bonus`. */
const exact = (playerId: string, matchId: string, bonus = 0): MatchScore => ({
  playerId,
  matchId,
  outcomeCorrect: true,
  exact: true,
  basePoints: 3,
  uniqueBonus: bonus,
  points: 3 + bonus,
});

/** Solo esito azzeccato: 1 punto, +1 se `bonus`. */
const outcome = (playerId: string, matchId: string, bonus = 0): MatchScore => ({
  playerId,
  matchId,
  outcomeCorrect: true,
  exact: false,
  basePoints: 1,
  uniqueBonus: bonus,
  points: 1 + bonus,
});

/** Pronostico sbagliato: 0 punti, ma la partita risulta comunque giocata. */
const miss = (playerId: string, matchId: string): MatchScore => ({
  playerId,
  matchId,
  outcomeCorrect: false,
  exact: false,
  basePoints: 0,
  uniqueBonus: 0,
  points: 0,
});

const players = (...names: string[]): PlayerRef[] =>
  names.map((displayName) => ({
    playerId: displayName.toLowerCase(),
    displayName,
  }));

describe("ordinamento della classifica", () => {
  it("ordina per punti decrescenti", () => {
    const standings = computeStandings(
      [
        exact("anna", "m1"),
        exact("anna", "m2"),
        outcome("bruno", "m1"),
        miss("carla", "m1"),
      ],
      players("Anna", "Bruno", "Carla"),
    );

    expect(standings.map((r) => r.displayName)).toEqual([
      "Anna",
      "Bruno",
      "Carla",
    ]);
    expect(standings.map((r) => r.points)).toEqual([6, 1, 0]);
    expect(standings.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("a parità di punti mette davanti chi ha più esiti azzeccati", () => {
    // Anna: 3 punti da un solo risultato esatto (1 esito azzeccato).
    // Bruno: 3 punti da tre esiti azzeccati.
    const standings = computeStandings(
      [
        exact("anna", "m1"),
        outcome("bruno", "m1"),
        outcome("bruno", "m2"),
        outcome("bruno", "m3"),
      ],
      players("Anna", "Bruno"),
    );

    expect(standings[0].displayName).toBe("Bruno");
    expect(standings[0].points).toBe(3);
    expect(standings[0].outcomeCount).toBe(3);
    expect(standings[1].displayName).toBe("Anna");
    expect(standings[1].outcomeCount).toBe(1);
  });

  it("a parità di punti ed esiti mette davanti chi ha più risultati esatti", () => {
    // Anna:  esatto (3) + esito (1)          = 4 punti, 2 esiti, 1 esatto
    // Bruno: esito+bonus (2) + esito+bonus (2) = 4 punti, 2 esiti, 0 esatti
    const standings = computeStandings(
      [
        exact("anna", "m1"),
        outcome("anna", "m2"),
        outcome("bruno", "m1", 1),
        outcome("bruno", "m2", 1),
      ],
      players("Anna", "Bruno"),
    );

    expect(standings.map((r) => r.points)).toEqual([4, 4]);
    expect(standings.map((r) => r.outcomeCount)).toEqual([2, 2]);
    expect(standings[0].displayName).toBe("Anna");
    expect(standings[0].exactCount).toBe(1);
    expect(standings[1].displayName).toBe("Bruno");
  });

  it("a parità totale ordina per nome, ignorando maiuscole e accenti", () => {
    const standings = computeStandings(
      [exact("zeno", "m1"), exact("andrea", "m1"), exact("èlia", "m1")],
      [
        { playerId: "zeno", displayName: "zeno" },
        { playerId: "andrea", displayName: "Andrea" },
        { playerId: "èlia", displayName: "Èlia" },
      ],
    );

    expect(standings.map((r) => r.displayName)).toEqual([
      "Andrea",
      "Èlia",
      "zeno",
    ]);
  });
});

describe("posizioni condivise", () => {
  it("assegna la stessa posizione a chi è pari su tutti e tre i criteri", () => {
    const standings = computeStandings(
      [
        exact("anna", "m1"),
        exact("anna", "m2"),
        exact("bruno", "m1"),
        exact("carla", "m1"),
        outcome("dario", "m1"),
      ],
      players("Anna", "Bruno", "Carla", "Dario"),
    );

    expect(standings.map((r) => r.displayName)).toEqual([
      "Anna",
      "Bruno",
      "Carla",
      "Dario",
    ]);
    // Bruno e Carla sono identici: stessa posizione, e Dario scala alla 4ª.
    expect(standings.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("non condivide la posizione se i punti coincidono ma gli esiti no", () => {
    const standings = computeStandings(
      [
        exact("anna", "m1"),
        outcome("bruno", "m1"),
        outcome("bruno", "m2"),
        outcome("bruno", "m3"),
      ],
      players("Anna", "Bruno"),
    );

    expect(standings.map((r) => r.rank)).toEqual([1, 2]);
  });
});

describe("giocatori senza punteggi", () => {
  it("include chi non ha ancora pronosticato nulla, a quota zero", () => {
    const standings = computeStandings(
      [exact("anna", "m1")],
      players("Anna", "Bruno"),
    );

    expect(standings).toHaveLength(2);
    const bruno = standings[1];
    expect(bruno.displayName).toBe("Bruno");
    expect(bruno.points).toBe(0);
    expect(bruno.outcomeCount).toBe(0);
    expect(bruno.exactCount).toBe(0);
    expect(bruno.scoredMatches).toBe(0);
  });

  it("conta come giocate anche le partite sbagliate", () => {
    const standings = computeStandings(
      [miss("anna", "m1"), miss("anna", "m2"), exact("anna", "m3")],
      players("Anna"),
    );

    expect(standings[0].scoredMatches).toBe(3);
    expect(standings[0].points).toBe(3);
  });

  it("ignora i punteggi di chi non fa parte della lega", () => {
    const standings = computeStandings(
      [exact("anna", "m1"), exact("estraneo", "m1")],
      players("Anna"),
    );

    expect(standings).toHaveLength(1);
    expect(standings[0].points).toBe(3);
  });

  it("regge una lega senza punteggi", () => {
    const standings = computeStandings([], players("Anna", "Bruno"));
    expect(standings.map((r) => r.points)).toEqual([0, 0]);
    expect(standings.map((r) => r.rank)).toEqual([1, 1]);
  });
});
