import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { serviceClient } from "@/lib/supabase/server";

const schema = z.object({ leagueId: z.string().uuid() });

/**
 * Sceglie la lega attiva.
 *
 * L'iscrizione viene riletta dal database invece di fidarsi di quanto
 * arriva dal browser: è l'unico modo per essere certi che chi chiede di
 * entrare in una lega ne faccia davvero parte.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Lega non valida." }, { status: 400 });
  }

  const { data: membership } = await serviceClient()
    .from("league_members")
    .select("league_id, display_name, role")
    .eq("player_id", session.playerId)
    .eq("league_id", parsed.data.leagueId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "Non fai parte di questa lega." },
      { status: 403 },
    );
  }

  await setSessionCookie(
    await createSessionToken({
      playerId: session.playerId,
      username: session.username,
      leagueId: membership.league_id as string,
      displayName: membership.display_name as string,
      isAdmin: membership.role === "admin",
    }),
  );

  return NextResponse.json({ ok: true });
}
