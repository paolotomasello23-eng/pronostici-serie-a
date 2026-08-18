import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/lib/supabase/server";
import { hashPin, isValidPinFormat, PIN_LENGTH } from "@/lib/auth/pin";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { normalizeInviteCode } from "@/lib/leagues";

const schema = z.object({
  inviteCode: z.string().min(1).max(20),
  displayName: z.string().trim().min(2).max(20),
  pin: z.string(),
});

/** Primo ingresso in lega: crea il giocatore e lo iscrive. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Nome non valido: servono da 2 a 20 caratteri." },
      { status: 400 },
    );
  }

  const { inviteCode, displayName, pin } = parsed.data;

  if (!isValidPinFormat(pin)) {
    return NextResponse.json(
      { error: `Il PIN deve essere di ${PIN_LENGTH} cifre.` },
      { status: 400 },
    );
  }

  const admin = serviceClient();
  const { data, error } = await admin
    .rpc("register_and_join", {
      p_invite_code: normalizeInviteCode(inviteCode),
      p_display_name: displayName,
      p_pin_hash: await hashPin(pin),
    })
    .single();

  if (error || !data) {
    const message = error?.message ?? "";
    if (message.includes("INVITE_CODE_NOT_FOUND")) {
      return NextResponse.json({ error: "Codice non riconosciuto." }, { status: 404 });
    }
    if (message.includes("NAME_TAKEN")) {
      return NextResponse.json(
        { error: "Questo nome è già preso nella lega. Scegline un altro." },
        { status: 409 },
      );
    }
    if (message.includes("LEAGUE_FULL")) {
      return NextResponse.json(
        { error: "La lega è al completo (10 giocatori)." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Non è stato possibile completare l'iscrizione." },
      { status: 500 },
    );
  }

  const row = data as {
    player_id: string;
    league_id: string;
    display_name: string;
    role: string;
  };

  await setSessionCookie(
    await createSessionToken({
      playerId: row.player_id,
      leagueId: row.league_id,
      displayName: row.display_name,
      isAdmin: row.role === "admin",
    }),
  );

  return NextResponse.json({ ok: true, displayName: row.display_name });
}
