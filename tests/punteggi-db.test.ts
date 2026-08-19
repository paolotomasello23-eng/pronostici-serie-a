import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { recomputeMatchday } from "@/lib/scoring/persist";
import { computeStandings } from "@/lib/scoring";

/**
 * Il motore di punteggio collegato al database vero.
 *
 * I test di `engine.test.ts` dimostrano che le regole sono giuste; questo
 * dimostra che sono le regole che arrivano davvero in classifica — che i
 * pronostici vengono letti tutti, che il bonus "unico" vede l'intera lega e
 * che una partita non finita non produce punti.
 *
 * Stagione finta 1901, ripulita alla fine.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const canRun = Boolean(URL_ && SERVICE_KEY && ANON_KEY && JWT_SECRET);

async function clientFor(playerId: string, leagueId: string) {
  const token = await new SignJWT({ role: "authenticated", league_id: leagueId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(playerId)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET!));

  return createClient(URL_!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

const TEST_SEASON = 1901;

/**
 * I giocatori creati da questo file portano questo prefisso nel nome utente,
 * e la pulizia li cerca da lì. Passare dalla lega non basta: se il setup
 * fallisce dopo aver creato i giocatori ma prima di iscriverli, quelli
 * restano orfani e nessuno li ritrova più — in due giorni se n'erano
 * accumulati diciotto.
 *
 * Il prefisso è diverso in ogni file di test apposta: Vitest esegue i file
 * in parallelo sullo stesso database, e con un prefisso condiviso la
 * pulizia di uno cancellerebbe i giocatori dell'altro mentre sta lavorando.
 *
 * Niente underscore: in una clausola LIKE è un carattere jolly, e
 * "__test%" cancellerebbe molto più del previsto.
 */
const TEST_PREFIX = "zztest-sco-";


describe.skipIf(!canRun)("punteggi scritti nel database", () => {
  let admin: SupabaseClient;
  let leagueId: string;
  let matchdayId: string;
  let players: Record<"anna" | "bruno" | "carla", string>;
  let matches: Record<"m1" | "m2" | "m3", string>;

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // La migrazione 0004 introduce la funzione che scrive i punteggi: senza
    // quella non c'è test che tenga.
    const { error: probe } = await admin.rpc("replace_matchday_scores", {
      p_league_id: "00000000-0000-0000-0000-000000000000",
      p_matchday_id: "00000000-0000-0000-0000-000000000000",
      p_scores: [],
    });
    if (probe && /could not find|does not exist/i.test(probe.message)) {
      throw new Error(
        "Manca la funzione replace_matchday_scores: esegui supabase/migrations/0004_scoring.sql nell'SQL Editor.",
      );
    }

    await cleanup(admin);

    const { data: league, error: leagueError } = await admin
      .from("leagues")
      .insert({
        name: "TEST punteggi",
        invite_code: `P${Date.now().toString(36).toUpperCase().slice(-5)}`,
        season: TEST_SEASON,
        unique_bonus_min_predictions: 3,
      })
      .select("id")
      .single();
    if (leagueError) throw leagueError;
    leagueId = league.id;

    const stamp = Date.now();
    const { data: created, error: playersError } = await admin
      .from("players")
      .insert([
        { pin_hash: "t", username: `${TEST_PREFIX}${stamp}-anna` },
        { pin_hash: "t", username: `${TEST_PREFIX}${stamp}-bruno` },
        { pin_hash: "t", username: `${TEST_PREFIX}${stamp}-carla` },
      ])
      .select("id");
    if (playersError) throw playersError;
    players = {
      anna: created[0].id,
      bruno: created[1].id,
      carla: created[2].id,
    };

    // `role` va ripetuto su ogni riga: in un insert multiplo Supabase
    // allinea le colonne a quelle della prima riga, quindi le successive
    // riceverebbero NULL esplicito invece del default 'player' — e l'intero
    // inserimento verrebbe rifiutato.
    const { error: membersError } = await admin.from("league_members").insert([
      { league_id: leagueId, player_id: players.anna, display_name: "Anna", role: "admin" },
      { league_id: leagueId, player_id: players.bruno, display_name: "Bruno", role: "player" },
      { league_id: leagueId, player_id: players.carla, display_name: "Carla", role: "player" },
    ]);
    if (membersError) throw membersError;

    const kickoff = new Date(Date.now() - 86_400_000).toISOString();

    const { data: day, error: dayError } = await admin
      .from("matchdays")
      .insert({ season: TEST_SEASON, number: 1, lock_at: kickoff, status: "locked" })
      .select("id")
      .single();
    if (dayError) throw dayError;
    matchdayId = day.id;

    const { data: createdMatches, error: matchError } = await admin
      .from("matches")
      .insert([
        {
          matchday_id: matchdayId, home_team: "Casa 1", away_team: "Ospite 1",
          kickoff_at: kickoff, status: "FINISHED", home_goals: 2, away_goals: 1, position: 1,
        },
        {
          matchday_id: matchdayId, home_team: "Casa 2", away_team: "Ospite 2",
          kickoff_at: kickoff, status: "FINISHED", home_goals: 0, away_goals: 0, position: 2,
        },
        // Rinviata: pronosticata da tutti, ma non deve valere niente.
        {
          matchday_id: matchdayId, home_team: "Casa 3", away_team: "Ospite 3",
          kickoff_at: kickoff, status: "POSTPONED", position: 3,
        },
      ])
      .select("id, position");
    if (matchError) throw matchError;

    const byPosition = (p: number) =>
      createdMatches.find((m) => m.position === p)!.id as string;
    matches = { m1: byPosition(1), m2: byPosition(2), m3: byPosition(3) };

    const p = (playerId: string, matchId: string, h: number, a: number) => ({
      league_id: leagueId, player_id: playerId, match_id: matchId,
      home_goals: h, away_goals: a,
    });

    const { error: predictionsError } = await admin.from("predictions").insert([
      // m1 finita 2-1: Anna esatta, Bruno prende l'esito, Carla sbaglia.
      // L'1 lo azzeccano in due: 1 punto di bonus a testa.
      p(players.anna, matches.m1, 2, 1),
      p(players.bruno, matches.m1, 3, 0),
      p(players.carla, matches.m1, 0, 2),
      // m2 finita 0-0: solo Bruno azzecca la X, ed è esatta -> 3 + 2 = 5.
      p(players.anna, matches.m2, 1, 0),
      p(players.bruno, matches.m2, 0, 0),
      p(players.carla, matches.m2, 2, 1),
      // m3 rinviata: pronosticata, ma non vale.
      p(players.anna, matches.m3, 1, 1),
      p(players.bruno, matches.m3, 2, 2),
      p(players.carla, matches.m3, 0, 1),
    ]);
    if (predictionsError) throw predictionsError;
  });

  afterAll(async () => {
    if (admin) await cleanup(admin);
  });

  it("scrive i punteggi solo per le partite finite", async () => {
    const result = await recomputeMatchday(admin, { leagueId, matchdayId });

    expect(result.totalMatches).toBe(3);
    expect(result.finishedMatches).toBe(2);
    expect(result.scoredRows).toBe(6); // 3 giocatori × 2 partite valutate
    expect(result.complete).toBe(false);

    const { data } = await admin
      .from("prediction_scores")
      .select("match_id")
      .eq("league_id", leagueId)
      .eq("match_id", matches.m3);

    expect(data ?? []).toHaveLength(0);
  });

  it("applica le regole del gioco, bonus compreso", async () => {
    await recomputeMatchday(admin, { leagueId, matchdayId });

    const { data } = await admin
      .from("prediction_scores")
      .select("player_id, match_id, base_points, unique_bonus, points, exact, outcome_correct")
      .eq("league_id", leagueId);

    const find = (playerId: string, matchId: string) =>
      (data ?? []).find((r) => r.player_id === playerId && r.match_id === matchId)!;

    // m1: l'esito lo prendono in due, quindi i 2 punti si dividono.
    expect(find(players.anna, matches.m1)).toMatchObject({
      base_points: 3, unique_bonus: 1, points: 4, exact: true,
    });
    expect(find(players.bruno, matches.m1)).toMatchObject({
      base_points: 1, unique_bonus: 1, points: 2, exact: false,
    });
    expect(find(players.carla, matches.m1)).toMatchObject({
      base_points: 0, unique_bonus: 0, points: 0, outcome_correct: false,
    });

    // m2: unico ad azzeccare la X, e per giunta esatta -> 3 + 2 = 5.
    expect(find(players.bruno, matches.m2)).toMatchObject({
      base_points: 3, unique_bonus: 2, points: 5,
    });
    expect(find(players.anna, matches.m2).points).toBe(0);
    expect(find(players.carla, matches.m2).points).toBe(0);
  });

  it("è idempotente: ricalcolare non raddoppia i punti", async () => {
    await recomputeMatchday(admin, { leagueId, matchdayId });
    await recomputeMatchday(admin, { leagueId, matchdayId });

    const { data, count } = await admin
      .from("prediction_scores")
      .select("points", { count: "exact" })
      .eq("league_id", leagueId);

    expect(count).toBe(6);
    const total = (data ?? []).reduce((sum, r) => sum + (r.points as number), 0);
    expect(total).toBe(11); // Anna 4 + Bruno 2 + Bruno 5
  });

  it("aggiunge i punti del recupero senza toccare quelli già assegnati", async () => {
    // La partita rinviata si gioca e finisce 1-1: Anna l'aveva azzeccata.
    await admin
      .from("matches")
      .update({ status: "FINISHED", home_goals: 1, away_goals: 1 })
      .eq("id", matches.m3);

    const result = await recomputeMatchday(admin, { leagueId, matchdayId });

    expect(result.finishedMatches).toBe(3);
    expect(result.complete).toBe(true);
    expect(result.scoredRows).toBe(9);

    const { data } = await admin
      .from("prediction_scores")
      .select("player_id, points")
      .eq("league_id", leagueId);

    const totals = new Map<string, number>();
    for (const row of data ?? []) {
      totals.set(
        row.player_id as string,
        (totals.get(row.player_id as string) ?? 0) + (row.points as number),
      );
    }

    // m3 finita 1-1: la X la azzeccano in due, 1 punto di bonus a testa.
    expect(totals.get(players.anna)).toBe(8); // 4 + 0 + 4
    expect(totals.get(players.bruno)).toBe(9); // 2 + 5 + 2
    expect(totals.get(players.carla)).toBe(0);

    // La giornata ora è completa.
    const { data: day } = await admin
      .from("matchdays")
      .select("status")
      .eq("id", matchdayId)
      .single();
    expect(day!.status).toBe("scored");
  });

  it("costruisce la classifica dalla vista, con gli spareggi giusti", async () => {
    // Tutte e tre le partite finite.
    await admin
      .from("matches")
      .update({ status: "FINISHED", home_goals: 1, away_goals: 1 })
      .eq("id", matches.m3);
    await recomputeMatchday(admin, { leagueId, matchdayId });

    const asAnna = await clientFor(players.anna, leagueId);
    const { data, error } = await asAnna
      .from("v_scores_by_matchday")
      .select("player_id, match_id, outcome_correct, exact, base_points, unique_bonus, points")
      .eq("league_id", leagueId);

    if (error && /does not exist|not find/i.test(error.message)) {
      throw new Error(
        "Manca la vista v_scores_by_matchday: esegui supabase/migrations/0005_standings_view.sql nell'SQL Editor.",
      );
    }
    expect(error).toBeNull();

    const standings = computeStandings(
      (data ?? []).map((r) => ({
        playerId: r.player_id as string,
        matchId: r.match_id as string,
        outcomeCorrect: r.outcome_correct as boolean,
        exact: r.exact as boolean,
        basePoints: r.base_points as number,
        uniqueBonus: r.unique_bonus as number,
        points: r.points as number,
      })),
      [
        { playerId: players.anna, displayName: "Anna" },
        { playerId: players.bruno, displayName: "Bruno" },
        { playerId: players.carla, displayName: "Carla" },
      ],
    );

    // Bruno passa avanti con 9 punti contro gli 8 di Anna: i bonus pieni
    // presi da solo sulla m2 fanno la differenza.
    expect(standings.map((r) => [r.displayName, r.points, r.outcomeCount])).toEqual([
      ["Bruno", 9, 3],
      ["Anna", 8, 2],
      ["Carla", 0, 0],
    ]);
    expect(standings.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("la vista non mostra i punteggi a chi non è nella lega", async () => {
    // Il rischio vero di una vista: girare con i permessi di chi l'ha
    // creata e diventare una scorciatoia per leggere dati altrui.
    const { data: outsider } = await admin
      .from("players")
      .insert({ pin_hash: "t", username: `${TEST_PREFIX}${Date.now()}-estraneo` })
      .select("id")
      .single();

    const asOutsider = await clientFor(outsider!.id as string, leagueId);
    const { data, error } = await asOutsider
      .from("v_scores_by_matchday")
      .select("player_id")
      .eq("league_id", leagueId);

    // Senza questo controllo il test passerebbe anche se la vista non
    // esistesse affatto: "nessuna riga" e "nessuna tabella" si assomigliano
    // troppo per fidarsi del solo conteggio.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    await admin.from("players").delete().eq("id", outsider!.id as string);
  });

  it("toglie i punti se una partita torna a non essere finita", async () => {
    // Caso raro ma non impossibile: un risultato inserito per errore e poi
    // corretto. I punti che non spettano più devono sparire.
    await admin
      .from("matches")
      .update({ status: "POSTPONED", home_goals: null, away_goals: null })
      .eq("id", matches.m3);

    const result = await recomputeMatchday(admin, { leagueId, matchdayId });

    expect(result.finishedMatches).toBe(2);
    expect(result.complete).toBe(false);

    const { count } = await admin
      .from("prediction_scores")
      .select("player_id", { count: "exact", head: true })
      .eq("league_id", leagueId)
      .eq("match_id", matches.m3);

    expect(count).toBe(0);
  });
});

async function cleanup(admin: SupabaseClient): Promise<void> {
  const { data: days } = await admin
    .from("matchdays")
    .select("id")
    .eq("season", TEST_SEASON);
  const dayIds = (days ?? []).map((d) => d.id as string);

  if (dayIds.length) {
    const { data: ms } = await admin
      .from("matches")
      .select("id")
      .in("matchday_id", dayIds);
    const matchIds = (ms ?? []).map((m) => m.id as string);
    if (matchIds.length) {
      await admin.from("prediction_scores").delete().in("match_id", matchIds);
      await admin.from("predictions").delete().in("match_id", matchIds);
    }
  }

  const { data: leagues } = await admin
    .from("leagues")
    .select("id")
    .eq("season", TEST_SEASON);

  for (const league of leagues ?? []) {
    const { data: members } = await admin
      .from("league_members")
      .select("player_id")
      .eq("league_id", league.id as string);
    await admin.from("leagues").delete().eq("id", league.id as string);
    for (const member of members ?? []) {
      await admin.from("players").delete().eq("id", member.player_id as string);
    }
  }

  if (dayIds.length) await admin.from("matchdays").delete().in("id", dayIds);

  // Rete di sicurezza, come sopra.
  await admin.from("players").delete().like("username", `${TEST_PREFIX}%`);
}
