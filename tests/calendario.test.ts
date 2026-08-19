import { describe, expect, it } from "vitest";
import {
  arePredictionsOpen,
  computeLockAt,
  isMatchdayVisible,
  predictionsOpenAt,
  usableGoals,
} from "@/lib/matches/types";
import type { MatchInput, MatchStatus } from "@/lib/matches/types";

const match = (
  kickoffAt: string,
  status: MatchStatus = "TIMED",
  goals?: [number, number],
): MatchInput => ({
  externalId: null,
  homeTeam: "Casa",
  homeTeamShort: "Casa",
  awayTeam: "Trasferta",
  awayTeamShort: "Trasferta",
  kickoffAt,
  status,
  homeGoals: goals?.[0] ?? null,
  awayGoals: goals?.[1] ?? null,
});

describe("computeLockAt", () => {
  it("prende il calcio d'inizio della prima partita", () => {
    expect(
      computeLockAt([
        match("2026-08-23T16:30:00Z"),
        match("2026-08-22T16:30:00Z"),
        match("2026-08-24T18:45:00Z"),
      ]),
    ).toBe("2026-08-22T16:30:00Z");
  });

  it("ignora le partite rinviate", () => {
    // Il venerdì è stato rinviato: la giornata deve bloccarsi al sabato,
    // non restare appesa a una data che non esiste più.
    expect(
      computeLockAt([
        match("2026-08-21T18:45:00Z", "POSTPONED"),
        match("2026-08-22T16:30:00Z"),
        match("2026-08-23T18:45:00Z"),
      ]),
    ).toBe("2026-08-22T16:30:00Z");
  });

  it("ignora anche le partite annullate", () => {
    expect(
      computeLockAt([
        match("2026-08-21T18:45:00Z", "CANCELLED"),
        match("2026-08-22T16:30:00Z"),
      ]),
    ).toBe("2026-08-22T16:30:00Z");
  });

  it("tiene conto delle partite già giocate o in corso", () => {
    // Una partita in corso non sposta il lock in avanti: la giornata è
    // cominciata, e il suo inizio resta quello.
    expect(
      computeLockAt([
        match("2026-08-22T16:30:00Z", "IN_PLAY"),
        match("2026-08-23T18:45:00Z"),
      ]),
    ).toBe("2026-08-22T16:30:00Z");
  });

  it("restituisce null se tutte le partite sono rinviate", () => {
    expect(
      computeLockAt([
        match("2026-08-22T16:30:00Z", "POSTPONED"),
        match("2026-08-23T18:45:00Z", "CANCELLED"),
      ]),
    ).toBeNull();
  });

  it("restituisce null se non ci sono partite", () => {
    expect(computeLockAt([])).toBeNull();
  });
});

describe("usableGoals", () => {
  it("accetta il risultato di una partita finita", () => {
    expect(usableGoals(match("2026-08-22T16:30:00Z", "FINISHED", [2, 1]))).toEqual({
      homeGoals: 2,
      awayGoals: 1,
    });
  });

  it("accetta lo 0-0", () => {
    expect(usableGoals(match("2026-08-22T16:30:00Z", "FINISHED", [0, 0]))).toEqual({
      homeGoals: 0,
      awayGoals: 0,
    });
  });

  it("scarta il punteggio di una partita ancora in corso", () => {
    // Un 1-0 al 40' non è un risultato: se finisse in classifica, i punti
    // sarebbero assegnati su una partita che non è finita.
    expect(usableGoals(match("2026-08-22T16:30:00Z", "IN_PLAY", [1, 0]))).toEqual({
      homeGoals: null,
      awayGoals: null,
    });
  });

  it("scarta il punteggio di una partita sospesa", () => {
    expect(usableGoals(match("2026-08-22T16:30:00Z", "SUSPENDED", [1, 1]))).toEqual({
      homeGoals: null,
      awayGoals: null,
    });
  });

  it("scarta un FINISHED senza punteggio", () => {
    expect(usableGoals(match("2026-08-22T16:30:00Z", "FINISHED"))).toEqual({
      homeGoals: null,
      awayGoals: null,
    });
  });
});

describe("finestra dei cinque giorni", () => {
  const lock = "2026-08-22T16:30:00Z";
  const alle = (iso: string) => new Date(iso);

  it("si apre esattamente cinque giorni prima del calcio d'inizio", () => {
    expect(predictionsOpenAt(lock).toISOString()).toBe("2026-08-17T16:30:00.000Z");
  });

  it("prima non si può pronosticare", () => {
    // Un minuto prima dell'apertura.
    expect(arePredictionsOpen(lock, alle("2026-08-17T16:29:00Z"))).toBe(false);
  });

  it("nel momento esatto dell'apertura si può", () => {
    expect(arePredictionsOpen(lock, alle("2026-08-17T16:30:00Z"))).toBe(true);
  });

  it("durante la finestra si può", () => {
    expect(arePredictionsOpen(lock, alle("2026-08-20T10:00:00Z"))).toBe(true);
    expect(arePredictionsOpen(lock, alle("2026-08-22T16:29:00Z"))).toBe(true);
  });

  it("al calcio d'inizio si chiude", () => {
    expect(arePredictionsOpen(lock, alle("2026-08-22T16:30:00Z"))).toBe(false);
    expect(arePredictionsOpen(lock, alle("2026-08-23T12:00:00Z"))).toBe(false);
  });

  it("una giornata senza orario non accetta pronostici", () => {
    // Succede quando tutte le partite sono rinviate: senza un momento di
    // riferimento non c'è né apertura né chiusura.
    expect(arePredictionsOpen(null, alle("2026-08-20T10:00:00Z"))).toBe(false);
  });
});

describe("finestra di visibilità", () => {
  const lock = "2026-08-22T16:30:00Z";
  const alle = (iso: string) => new Date(iso);

  it("compare sette giorni prima del calcio d'inizio", () => {
    expect(isMatchdayVisible(lock, alle("2026-08-15T16:30:00Z"))).toBe(true);
  });

  it("prima non compare", () => {
    expect(isMatchdayVisible(lock, alle("2026-08-15T16:29:00Z"))).toBe(false);
    expect(isMatchdayVisible(lock, alle("2026-08-01T00:00:00Z"))).toBe(false);
  });

  it("resta visibile per sempre dopo essere stata giocata", () => {
    // Lo storico serve proprio a tornare sulle giornate passate.
    expect(isMatchdayVisible(lock, alle("2026-12-25T00:00:00Z"))).toBe(true);
  });

  it("è visibile due giorni prima di diventare giocabile", () => {
    const compare = alle("2026-08-15T16:30:00Z");
    const gioca = predictionsOpenAt(lock);
    expect(isMatchdayVisible(lock, compare)).toBe(true);
    expect(arePredictionsOpen(lock, compare)).toBe(false);
    expect(
      (gioca.getTime() - compare.getTime()) / 86_400_000,
    ).toBe(2);
  });

  it("una giornata senza orario non compare", () => {
    expect(isMatchdayVisible(null, alle("2026-08-20T10:00:00Z"))).toBe(false);
  });
});
