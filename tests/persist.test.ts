import { describe, expect, it } from "vitest";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { recomputeMatchday, recomputeMatchdayAllLeagues } from "@/lib/scoring/persist";
import { FakeDb, MAX_ROWS } from "./fake-supabase";

/**
 * Il ricalcolo dei punti contro un database finto, che però ha lo stesso
 * tetto di 1000 righe per risposta di Supabase.
 */

describe("fetchAll", () => {
  const righe = Array.from({ length: 2345 }, (_, i) => ({ id: i }));

  it("legge oltre le 1000 righe", async () => {
    const tutte = await fetchAll(async (from, to) => ({
      data: righe.slice(from, Math.min(to + 1, from + MAX_ROWS)),
      error: null,
    }));
    expect(tutte).toHaveLength(2345);
    expect(new Set(tutte.map((r) => r.id)).size).toBe(2345);
  });

  it("regge un tetto più basso della dimensione di pagina", async () => {
    // Se il progetto restituisse 300 righe per volta, una pagina "corta" non
    // vorrebbe dire che le righe sono finite.
    const tutte = await fetchAll(async (from, to) => ({
      data: righe.slice(from, Math.min(to + 1, from + 300)),
      error: null,
    }));
    expect(tutte).toHaveLength(2345);
  });

  it("non inghiotte gli errori", async () => {
    await expect(
      fetchAll(async () => ({ data: null, error: { message: "boom" } })),
    ).rejects.toThrow("boom");
  });
});

const PASSATO = new Date(Date.now() - 86_400_000).toISOString();
const FUTURO = new Date(Date.now() + 86_400_000).toISOString();

/**
 * Due leghe: "piccola" con tre amici, "grande" con 150 persone. Dieci
 * partite per 153 persone fanno 1530 pronostici: più di quanti Supabase ne
 * restituisca in una volta.
 */
function setup(opts: { lockAt?: string; ultima?: string } = {}) {
  const db = new FakeDb();
  const matchdayId = "g1";

  db.tables.matchdays = [{ id: matchdayId, lock_at: opts.lockAt ?? PASSATO, status: "locked" }];
  db.tables.leagues = [
    { id: "piccola", unique_bonus_min_predictions: 3 },
    { id: "grande", unique_bonus_min_predictions: 3 },
  ];

  const piccola = ["anna", "bruno", "carla"];
  const grande = Array.from({ length: 150 }, (_, i) => `p${String(i).padStart(3, "0")}`);

  db.tables.league_members = [
    ...piccola.map((player_id) => ({ league_id: "piccola", player_id })),
    ...grande.map((player_id) => ({ league_id: "grande", player_id })),
  ];

  db.tables.matches = Array.from({ length: 10 }, (_, i) => ({
    id: `m${i}`,
    matchday_id: matchdayId,
    status: i === 9 ? (opts.ultima ?? "FINISHED") : "FINISHED",
    home_goals: i === 9 && opts.ultima && opts.ultima !== "FINISHED" ? null : 1,
    away_goals: i === 9 && opts.ultima && opts.ultima !== "FINISHED" ? null : 0,
  }));

  let n = 0;
  const pronostico = (player_id: string, match_id: string, h: number, a: number) => ({
    id: `pr${String(n++).padStart(5, "0")}`,
    player_id,
    match_id,
    home_goals: h,
    away_goals: a,
  });

  db.tables.predictions = [];
  for (const m of db.tables.matches) {
    const id = m.id as string;
    // Nella piccola solo Anna azzecca l'1: bonus pieno.
    db.tables.predictions.push(pronostico("anna", id, 1, 0));
    db.tables.predictions.push(pronostico("bruno", id, 0, 0));
    db.tables.predictions.push(pronostico("carla", id, 0, 1));
    // Nella grande tutti azzeccano l'esito: niente bonus per nessuno.
    for (const p of grande) db.tables.predictions.push(pronostico(p, id, 2, 0));
  }

  return { db, matchdayId, grande };
}

describe("recomputeMatchdayAllLeagues", () => {
  it("conta tutti i pronostici, anche oltre le 1000 righe", async () => {
    const { db, matchdayId, grande } = setup();
    expect(db.tables.predictions.length).toBeGreaterThan(MAX_ROWS);

    const result = await recomputeMatchdayAllLeagues(db.client(), matchdayId);

    const righe = db.scores.get(`grande|${matchdayId}`)!;
    // 150 persone per 10 partite: nessuna tagliata fuori.
    expect(righe).toHaveLength(grande.length * 10);
    expect(new Set(righe.map((r) => r.player_id)).size).toBe(grande.length);
    expect(result.leagueIds.sort()).toEqual(["grande", "piccola"]);
  });

  it("calcola il bonus dentro ciascuna lega", async () => {
    const { db, matchdayId } = setup();
    await recomputeMatchdayAllLeagues(db.client(), matchdayId);

    const piccola = db.scores.get(`piccola|${matchdayId}`)!;
    const anna = piccola.filter((r) => r.player_id === "anna");
    // Esatto (3) + unica ad azzeccare l'esito nella sua lega (2), per 10.
    expect(anna.reduce((s, r) => s + (r.points as number), 0)).toBe(50);
    // Nella piccola compaiono solo i suoi tre membri.
    expect(new Set(piccola.map((r) => r.player_id))).toEqual(
      new Set(["anna", "bruno", "carla"]),
    );

    const grande = db.scores.get(`grande|${matchdayId}`)!;
    expect(grande.every((r) => r.unique_bonus === 0)).toBe(true);
  });

  it("chiude la giornata solo quando non manca niente", async () => {
    const { db, matchdayId } = setup();
    const result = await recomputeMatchdayAllLeagues(db.client(), matchdayId);
    expect(result.complete).toBe(true);
    expect(db.tables.matchdays[0].status).toBe("scored");
  });

  it("lascia aperta la giornata con una partita rinviata", async () => {
    const { db, matchdayId } = setup({ ultima: "POSTPONED" });
    const result = await recomputeMatchdayAllLeagues(db.client(), matchdayId);
    expect(result.complete).toBe(false);
    expect(result.finishedMatches).toBe(9);
    expect(db.tables.matchdays[0].status).toBe("locked");
  });

  it("non aspetta per sempre una partita annullata", async () => {
    const { db, matchdayId } = setup({ ultima: "CANCELLED" });
    const result = await recomputeMatchdayAllLeagues(db.client(), matchdayId);
    expect(result.complete).toBe(true);
    expect(result.finishedMatches).toBe(9);
    expect(db.tables.matchdays[0].status).toBe("scored");
  });

  it("non tocca lo stato di una giornata non ancora iniziata", async () => {
    const { db, matchdayId } = setup({ lockAt: FUTURO });
    db.tables.matchdays[0].status = "open";
    await recomputeMatchdayAllLeagues(db.client(), matchdayId);
    expect(db.tables.matchdays[0].status).toBe("open");
  });
});

describe("recomputeMatchday (una lega sola)", () => {
  it("scrive i punti di quella lega e non chiude la giornata", async () => {
    const { db, matchdayId } = setup();
    const result = await recomputeMatchday(db.client(), {
      leagueId: "piccola",
      matchdayId,
    });

    expect(result.complete).toBe(true);
    expect(db.scores.has(`piccola|${matchdayId}`)).toBe(true);
    expect(db.scores.has(`grande|${matchdayId}`)).toBe(false);
    // Le altre leghe non hanno ancora i loro punti: guai a dichiararla chiusa.
    expect(db.tables.matchdays[0].status).toBe("locked");
  });
});
