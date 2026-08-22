import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { serviceClient } from "@/lib/supabase/server";
import { normalizeInviteCode } from "@/lib/leagues";

/** Le leghe a cui appartengo, con quanti siamo e la giornata in corso. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const admin = serviceClient();

  const { data: memberships } = await admin
    .from("league_members")
    .select("league_id, display_name, role, joined_at")
    .eq("player_id", session.playerId)
    .order("joined_at");

  const leagueIds = (memberships ?? []).map((m) => m.league_id as string);

  const { data: leagues } = leagueIds.length
    ? await admin.from("leagues").select("id, name, season").in("id", leagueIds)
    : { data: [] };

  const { data: counts } = leagueIds.length
    ? await admin.from("league_members").select("league_id").in("league_id", leagueIds)
    : { data: [] };

  const players = new Map<string, number>();
  for (const row of counts ?? []) {
    const id = row.league_id as string;
    players.set(id, (players.get(id) ?? 0) + 1);
  }

  const byId = new Map((leagues ?? []).map((l) => [l.id as string, l]));

  return NextResponse.json({
    activeLeagueId: session.leagueId,
    username: session.username,
    leagues: (memberships ?? []).map((m) => {
      const league = byId.get(m.league_id as string);
      return {
        id: m.league_id as string,
        name: (league?.name as string) ?? "Lega",
        season: league?.season as number,
        displayName: m.display_name as string,
        isAdmin: m.role === "admin",
        players: players.get(m.league_id as string) ?? 1,
      };
    }),
  });
}

const joinSchema = z.object({ inviteCode: z.string().min(1).max(20) });

/** Entra in un'altra lega con il suo codice d'invito. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const parsed = joinSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Codice non valido." }, { status: 400 });
  }

  const admin = serviceClient();
  const { data, error } = await admin
    .rpc("join_league", {
      p_player_id: session.playerId,
      p_invite_code: normalizeInviteCode(parsed.data.inviteCode),
    })
    .single();

  if (error || !data) {
    const message = error?.message ?? "";
    if (message.includes("INVITE_CODE_NOT_FOUND")) {
      return NextResponse.json({ error: "Codice non riconosciuto." }, { status: 404 });
    }
    if (message.includes("ALREADY_MEMBER")) {
      return NextResponse.json(
        { error: "Sei già in questa lega." },
        { status: 409 },
      );
    }
    if (message.includes("LEAGUE_FULL")) {
      return NextResponse.json(
        { error: "La lega non accetta altri giocatori." },
        { status: 409 },
      );
    }
    console.error("[/api/leagues/mine] ingresso fallito:", error);
    return NextResponse.json({ error: "Ingresso non riuscito." }, { status: 500 });
  }

  const row = data as { league_id: string; league_name: string };

  // Chi entra in una lega ci vuole entrare adesso, non sceglierla di nuovo
  // da un elenco: la rendiamo subito quella attiva.
  await setSessionCookie(
    await createSessionToken({
      playerId: session.playerId,
      username: session.username,
      leagueId: row.league_id,
      displayName: session.username,
      isAdmin: false,
    }),
  );

  return NextResponse.json({ ok: true, name: row.league_name });
}
