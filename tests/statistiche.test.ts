import { describe, expect, it } from "vitest";
import { computePlayerStats, computeTrophies } from "@/lib/scoring/stats";
import type { ScoreWithMatchday } from "@/lib/scoring/stats";
import type { PlayerRef } from "@/lib/scoring";

const PLAYERS: PlayerRef[] = [
  { playerId: "anna", displayName: "Anna" },
  { playerId: "bruno", displayName: "Bruno" },
  { playerId: "carla", displayName: "Carla" },
];

const score = (
  playerId: string,
  matchId: string,
  matchdayNumber: number,
  kind: "esatto" | "esito" | "zero",
  bonus = 0,
): ScoreWithMatchday => {
  const base = kind === "esatto" ? 3 : kind === "esito" ? 1 : 0;
  return {
    playerId,
    matchId,
    matchdayNumber,
    outcomeCorrect: kind !== "zero",
    exact: kind === "esatto",
    basePoints: base,
    uniqueBonus: bonus,
    points: base + bonus,
  };
};

/**
 * Due giornate, tre giocatori, conti fatti a mano.
 *
 * Giornata 1  Anna 3+1 = 4 | Bruno 1+1 = 2 (bonus) | Carla 0+3 = 3
 * Giornata 2  Anna 0       | Bruno 3+1 = 4 (bonus) | Carla non gioca
 */
const SCORES: ScoreWithMatchday[] = [
  score("anna", "m1", 1, "esatto"),
  score("anna", "m2", 1, "esito"),
  score("bruno", "m1", 1, "esito", 1),
  score("bruno", "m2", 1, "zero"),
  score("carla", "m1", 1, "zero"),
  score("carla", "m2", 1, "esatto"),
  score("anna", "m3", 2, "zero"),
  score("bruno", "m3", 2, "esatto", 1),
];

describe("statistiche dei giocatori", () => {
  const stats = computePlayerStats(SCORES, PLAYERS);
  const of = (name: string) => stats.find((s) => s.displayName === name)!;

  it("ordina per punti totali", () => {
    expect(stats.map((s) => [s.displayName, s.points])).toEqual([
      ["Bruno", 6],
      ["Anna", 4],
      ["Carla", 3],
    ]);
  });

  it("conta esiti, risultati esatti e partite giocate", () => {
    expect(of("Anna")).toMatchObject({
      playedMatches: 3,
      outcomeCount: 2,
      exactCount: 1,
    });
    expect(of("Carla")).toMatchObject({
      playedMatches: 2,
      outcomeCount: 1,
      exactCount: 1,
    });
  });

  it("conta i bonus controcorrente, in occasioni e in punti", () => {
    expect(of("Bruno").uniqueBonusCount).toBe(2);
    expect(of("Bruno").uniqueBonusPoints).toBe(2);
    expect(of("Anna").uniqueBonusCount).toBe(0);
    expect(of("Anna").uniqueBonusPoints).toBe(0);
  });

  it("conta le partite chiuse a zero", () => {
    expect(of("Anna").blanks).toBe(1);
    expect(of("Bruno").blanks).toBe(1);
    expect(of("Carla").blanks).toBe(1);
  });

  it("calcola la media sulle giornate giocate, non su tutte", () => {
    // Carla ha giocato una sola giornata: 3 punti in 1 = 3 di media, non 1,5.
    expect(of("Carla").matchdaysPlayed).toBe(1);
    expect(of("Carla").averagePerMatchday).toBe(3);
    expect(of("Anna").matchdaysPlayed).toBe(2);
    expect(of("Anna").averagePerMatchday).toBe(2);
    expect(of("Bruno").averagePerMatchday).toBe(3);
  });

  it("trova la giornata migliore e la peggiore", () => {
    expect(of("Anna").bestMatchday).toEqual({ number: 1, points: 4 });
    expect(of("Anna").worstMatchday).toEqual({ number: 2, points: 0 });
    expect(of("Bruno").bestMatchday).toEqual({ number: 2, points: 4 });
    expect(of("Bruno").worstMatchday).toEqual({ number: 1, points: 2 });
  });

  it("assegna le giornate vinte a chi ha fatto più punti", () => {
    // G1: Anna 4, Carla 3, Bruno 2. G2: Bruno 4, Anna 0.
    expect(of("Anna").matchdaysWon).toBe(1);
    expect(of("Bruno").matchdaysWon).toBe(1);
    expect(of("Carla").matchdaysWon).toBe(0);
  });

  it("calcola la percentuale di esiti azzeccati", () => {
    expect(of("Anna").outcomeRate).toBe(66.7);
    expect(of("Carla").outcomeRate).toBe(50);
  });

  it("include chi non ha ancora giocato, senza dividere per zero", () => {
    const stats = computePlayerStats([], PLAYERS);
    expect(stats).toHaveLength(3);
    expect(stats[0]).toMatchObject({
      points: 0,
      matchdaysPlayed: 0,
      averagePerMatchday: 0,
      outcomeRate: 0,
      bestMatchday: null,
    });
  });
});

describe("giornate vinte a pari merito", () => {
  it("le assegna a entrambi", () => {
    const stats = computePlayerStats(
      [
        score("anna", "m1", 1, "esatto"),
        score("bruno", "m1", 1, "esatto"),
        score("carla", "m1", 1, "zero"),
      ],
      PLAYERS,
    );
    const of = (name: string) => stats.find((s) => s.displayName === name)!;
    expect(of("Anna").matchdaysWon).toBe(1);
    expect(of("Bruno").matchdaysWon).toBe(1);
    expect(of("Carla").matchdaysWon).toBe(0);
  });

  it("non assegna nessuna vittoria in una giornata da zero punti per tutti", () => {
    const stats = computePlayerStats(
      [score("anna", "m1", 1, "zero"), score("bruno", "m1", 1, "zero")],
      PLAYERS,
    );
    expect(stats.every((s) => s.matchdaysWon === 0)).toBe(true);
  });
});

describe("trofei", () => {
  const stats = computePlayerStats(SCORES, PLAYERS);
  const trophies = computeTrophies(stats);
  const trophy = (key: string) => trophies.find((t) => t.key === key);

  it("assegna la competenza a chi ha più punti controcorrente", () => {
    expect(trophy("competenza")).toMatchObject({
      winners: ["Bruno"],
      value: "2 punti",
    });
  });

  it("assegna i primati a pari merito a tutti quelli in testa", () => {
    // Anna e Bruno hanno 2 esiti a testa.
    expect(trophy("esiti")!.winners.sort()).toEqual(["Anna", "Bruno"]);
    // Tutti e tre hanno un risultato esatto.
    expect(trophy("esatti")!.winners.sort()).toEqual(["Anna", "Bruno", "Carla"]);
  });

  it("non assegna un trofeo se il primato vale zero", () => {
    // Nessuno ha mai preso un bonus: la competenza non si premia.
    const senzaBonus = computePlayerStats(
      [score("anna", "m1", 1, "esito"), score("bruno", "m1", 1, "esito")],
      PLAYERS,
    );
    expect(computeTrophies(senzaBonus).find((t) => t.key === "competenza")).toBeUndefined();
  });

  it("non assegna niente a lega vuota", () => {
    expect(computeTrophies(computePlayerStats([], PLAYERS))).toEqual([]);
  });
});
