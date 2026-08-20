import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { serviceClient } from "@/lib/supabase/server";
import { generateInviteCode } from "@/lib/leagues";

const schema = z.object({ name: z.string().trim().min(2).max(60) });

/**
 * Crea una lega per chi è già registrato, e ne diventa amministratore.
 *
 * La lega appena creata diventa subito quella attiva: chi la crea vuole
 * entrarci adesso, non sceglierla di nuovo da un elenco.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Il nome della lega deve avere almeno 2 caratteri." },
      { status: 400 },
    );
  }

  const oggi = new Date();
  const stagione =
    oggi.getUTCMonth() >= 6 ? oggi.getUTCFullYear() : oggi.getUTCFullYear() - 1;

  const admin = serviceClient();
  const { data, error } = await admin
    .rpc("create_league_for_player", {
      p_player_id: session.playerId,
      p_league_name: parsed.data.name,
      p_invite_code: generateInviteCode(),
      p_season: stagione,
    })
    .single();

  if (error || !data) {
    if ((error?.message ?? "").includes("NAME_TOO_SHORT")) {
      return NextResponse.json(
        { error: "Il nome della lega è troppo corto." },
        { status: 400 },
      );
    }
    console.error("[/api/leagues/create] creazione fallita:", error);
    return NextResponse.json(
      { error: "Non è stato possibile creare la lega." },
      { status: 500 },
    );
  }

  const row = data as { league_id: string; league_name: string; invite_code: string };

  await setSessionCookie(
    await createSessionToken({
      playerId: session.playerId,
      username: session.username,
      leagueId: row.league_id,
      displayName: session.username,
      isAdmin: true,
    }),
  );

  return NextResponse.json({
    ok: true,
    name: row.league_name,
    inviteCode: row.invite_code,
  });
}
