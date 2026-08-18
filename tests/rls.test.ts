import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

/**
 * Test di integrazione contro il vero Supabase.
 *
 * Verifica la regola su cui poggia tutto il gioco: prima del lock i
 * pronostici sono segreti e modificabili, dopo sono pubblici e immutabili.
 * E la verifica dove conta davvero — nelle policy del database — non nel
 * codice delle API route, che è solo il primo dei due lucchetti.
 *
 * Usa una lega e una stagione finte (1900) che non toccano i dati veri, e
 * ripulisce tutto alla fine. Se le variabili d'ambiente non ci sono, questi
 * test si saltano da soli.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

const canRun = Boolean(URL_ && SERVICE_KEY && ANON_KEY && JWT_SECRET);

const TEST_SEASON = 1900;

async function tokenFor(playerId: string, leagueId: string): Promise<string> {
  return new SignJWT({ role: "authenticated", league_id: leagueId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(playerId)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET!));
}

describe.skipIf(!canRun)("policy RLS sui pronostici", () => {
  let admin: SupabaseClient;
  let leagueId: string;
  let playerA: string;
  let playerB: string;
  let openMatchId: string;
  let lockedMatchId: string;
  let asA: SupabaseClient;
  let asB: SupabaseClient;

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await cleanup(admin);

    const { data: league, error: leagueError } = await admin
      .from("leagues")
      .insert({
        name: "TEST RLS",
        invite_code: `T${Date.now().toString(36).toUpperCase().slice(-5)}`,
        season: TEST_SEASON,
      })
      .select("id")
      .single();
    if (leagueError) throw leagueError;
    leagueId = league.id;

    const { data: players, error: playersError } = await admin
      .from("players")
      .insert([{ pin_hash: "test" }, { pin_hash: "test" }])
      .select("id");
    if (playersError) throw playersError;
    playerA = players[0].id;
    playerB = players[1].id;

    await admin.from("league_members").insert([
      { league_id: leagueId, player_id: playerA, display_name: "Anna", role: "admin" },
      { league_id: leagueId, player_id: playerB, display_name: "Bruno", role: "player" },
    ]);

    const inOneDay = new Date(Date.now() + 86_400_000).toISOString();
    const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();

    const { data: days, error: daysError } = await admin
      .from("matchdays")
      .insert([
        { season: TEST_SEASON, number: 1, lock_at: inOneDay, status: "open" },
        { season: TEST_SEASON, number: 2, lock_at: oneDayAgo, status: "locked" },
      ])
      .select("id, number");
    if (daysError) throw daysError;

    const openDay = days.find((d) => d.number === 1)!.id;
    const lockedDay = days.find((d) => d.number === 2)!.id;

    const { data: matches, error: matchesError } = await admin
      .from("matches")
      .insert([
        {
          matchday_id: openDay,
          home_team: "Casa A", away_team: "Trasferta A",
          kickoff_at: inOneDay, status: "TIMED", position: 1,
        },
        {
          matchday_id: lockedDay,
          home_team: "Casa B", away_team: "Trasferta B",
          kickoff_at: oneDayAgo, status: "TIMED", position: 1,
        },
      ])
      .select("id, matchday_id");
    if (matchesError) throw matchesError;

    openMatchId = matches.find((m) => m.matchday_id === openDay)!.id;
    lockedMatchId = matches.find((m) => m.matchday_id === lockedDay)!.id;

    const clientFor = async (playerId: string) =>
      createClient(URL_!, ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { Authorization: `Bearer ${await tokenFor(playerId, leagueId)}` },
        },
      });

    asA = await clientFor(playerA);
    asB = await clientFor(playerB);
  });

  afterAll(async () => {
    if (admin) await cleanup(admin);
  });

  it("prima del lock un giocatore può salvare il proprio pronostico", async () => {
    const { error } = await asA.from("predictions").insert({
      league_id: leagueId,
      player_id: playerA,
      match_id: openMatchId,
      home_goals: 2,
      away_goals: 1,
    });

    expect(error).toBeNull();
  });

  it("prima del lock NON vede i pronostici degli altri", async () => {
    await asB.from("predictions").insert({
      league_id: leagueId,
      player_id: playerB,
      match_id: openMatchId,
      home_goals: 0,
      away_goals: 3,
    });

    const { data } = await asA
      .from("predictions")
      .select("player_id, home_goals, away_goals")
      .eq("match_id", openMatchId);

    expect(data).toHaveLength(1);
    expect(data![0].player_id).toBe(playerA);
    expect(data!.some((p) => p.player_id === playerB)).toBe(false);
  });

  it("prima del lock può correggere il proprio pronostico", async () => {
    const { data, error } = await asA
      .from("predictions")
      .update({ home_goals: 3, away_goals: 0 })
      .eq("match_id", openMatchId)
      .eq("player_id", playerA)
      .select("home_goals, away_goals");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toEqual({ home_goals: 3, away_goals: 0 });
  });

  it("non può inserire un pronostico a nome di un altro giocatore", async () => {
    const { error } = await asA.from("predictions").insert({
      league_id: leagueId,
      player_id: playerB, // non è lui
      match_id: openMatchId,
      home_goals: 9,
      away_goals: 9,
    });

    expect(error).not.toBeNull();
  });

  it("DOPO il lock il database rifiuta un nuovo pronostico", async () => {
    const { error } = await asA.from("predictions").insert({
      league_id: leagueId,
      player_id: playerA,
      match_id: lockedMatchId,
      home_goals: 1,
      away_goals: 0,
    });

    // Questa è la riga che conta: non è l'API route a dire di no, è Postgres.
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toContain("row-level security");
  });

  it("DOPO il lock il database rifiuta la modifica di un pronostico esistente", async () => {
    // Il pronostico esisteva già da prima che la giornata si bloccasse.
    await admin.from("predictions").insert({
      league_id: leagueId,
      player_id: playerA,
      match_id: lockedMatchId,
      home_goals: 1,
      away_goals: 1,
    });

    const { data, error } = await asA
      .from("predictions")
      .update({ home_goals: 5, away_goals: 0 })
      .eq("match_id", lockedMatchId)
      .eq("player_id", playerA)
      .select("home_goals, away_goals");

    // Una UPDATE bloccata da RLS non solleva errore: semplicemente non
    // trova righe da aggiornare. Il pronostico deve restare com'era.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    const { data: after } = await admin
      .from("predictions")
      .select("home_goals, away_goals")
      .eq("match_id", lockedMatchId)
      .eq("player_id", playerA)
      .single();

    expect(after).toEqual({ home_goals: 1, away_goals: 1 });
  });

  it("DOPO il lock i pronostici di tutti diventano visibili", async () => {
    await admin.from("predictions").insert({
      league_id: leagueId,
      player_id: playerB,
      match_id: lockedMatchId,
      home_goals: 2,
      away_goals: 2,
    });

    const { data } = await asA
      .from("predictions")
      .select("player_id")
      .eq("match_id", lockedMatchId);

    const ids = (data ?? []).map((p) => p.player_id);
    expect(ids).toContain(playerA);
    expect(ids).toContain(playerB);
  });

  it("nessuno può cancellare un pronostico", async () => {
    await asA
      .from("predictions")
      .delete()
      .eq("match_id", openMatchId)
      .eq("player_id", playerA);

    const { count } = await admin
      .from("predictions")
      .select("id", { count: "exact", head: true })
      .eq("match_id", openMatchId)
      .eq("player_id", playerA);

    expect(count).toBe(1);
  });

  it("un token firmato con la chiave sbagliata non vede niente", async () => {
    const forged = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(playerA)
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("chiave-inventata-da-un-furbo"));

    const impostor = createClient(URL_!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${forged}` } },
    });

    const { data, error } = await impostor
      .from("predictions")
      .select("id")
      .eq("match_id", openMatchId);

    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});

/** Toglie di mezzo tutto ciò che i test hanno creato. */
async function cleanup(admin: SupabaseClient): Promise<void> {
  const { data: days } = await admin
    .from("matchdays")
    .select("id")
    .eq("season", TEST_SEASON);

  const dayIds = (days ?? []).map((d) => d.id as string);

  if (dayIds.length) {
    const { data: matches } = await admin
      .from("matches")
      .select("id")
      .in("matchday_id", dayIds);
    const matchIds = (matches ?? []).map((m) => m.id as string);
    if (matchIds.length) {
      await admin.from("predictions").delete().in("match_id", matchIds);
      await admin.from("prediction_scores").delete().in("match_id", matchIds);
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

  if (dayIds.length) {
    await admin.from("matchdays").delete().in("id", dayIds);
  }
}
