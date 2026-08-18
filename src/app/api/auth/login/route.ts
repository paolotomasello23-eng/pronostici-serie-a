import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/lib/supabase/server";
import { isValidPinFormat, verifyPin } from "@/lib/auth/pin";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { normalizeInviteCode } from "@/lib/leagues";

const schema = z.object({
  inviteCode: z.string().min(1).max(20),
  displayName: z.string().trim().min(1).max(20),
  pin: z.string(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isValidPinFormat(parsed.data.pin)) {
    return NextResponse.json({ error: "Dati di accesso non validi." }, { status: 400 });
  }

  const { inviteCode, displayName, pin } = parsed.data;
  const admin = serviceClient();

  const { data: league } = await admin
    .from("leagues")
    .select("id")
    .eq("invite_code", normalizeInviteCode(inviteCode))
    .maybeSingle();

  if (!league) {
    return NextResponse.json({ error: "Codice non riconosciuto." }, { status: 404 });
  }

  // Confronto il nome in JS invece che con `ilike`: in un pattern SQL i
  // caratteri `%` e `_` sono jolly, quindi un nome come "a%" farebbe match
  // con quello di qualcun altro. I membri sono al massimo dieci.
  const { data: allMembers } = await admin
    .from("league_members")
    .select("player_id, display_name, role")
    .eq("league_id", league.id);

  const wanted = displayName.trim().toLocaleLowerCase("it");
  const member = (allMembers ?? []).find(
    (m) => String(m.display_name).trim().toLocaleLowerCase("it") === wanted,
  );

  if (!member) {
    return NextResponse.json(
      { error: "Nessun giocatore con questo nome nella lega." },
      { status: 404 },
    );
  }

  const check = await verifyPin(admin, member.player_id as string, pin);

  if (!check.ok) {
    if (check.reason === "locked") {
      const minutes = Math.max(
        1,
        Math.ceil((check.until.getTime() - Date.now()) / 60_000),
      );
      return NextResponse.json(
        {
          error: `Troppi tentativi sbagliati. Riprova tra ${minutes} minuti.`,
        },
        { status: 429 },
      );
    }
    return NextResponse.json(
      {
        error:
          check.attemptsLeft > 0
            ? `PIN sbagliato. Hai ancora ${check.attemptsLeft} tentativi.`
            : "PIN sbagliato.",
      },
      { status: 401 },
    );
  }

  await setSessionCookie(
    await createSessionToken({
      playerId: member.player_id as string,
      leagueId: league.id as string,
      displayName: member.display_name as string,
      isAdmin: member.role === "admin",
    }),
  );

  return NextResponse.json({ ok: true, displayName: member.display_name });
}
