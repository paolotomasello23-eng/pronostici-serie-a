import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/lib/supabase/server";
import { hashPin, isValidPinFormat, PIN_LENGTH } from "@/lib/auth/pin";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { normalizeInviteCode } from "@/lib/leagues";

const schema = z.object({
  inviteCode: z.string().min(1).max(20),
  // Niente spazi né simboli: il nome utente si digita al login, e un
  // carattere invisibile di troppo diventa un'ora di "non riesco a entrare".
  username: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[\p{L}\p{N}_.-]+$/u, "caratteri non ammessi"),
  pin: z.string(),
});

/** Primo accesso in assoluto: crea l'account e lo mette nella lega invitante. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Nome utente non valido: da 2 a 20 caratteri, senza spazi né simboli.",
      },
      { status: 400 },
    );
  }

  const { inviteCode, username, pin } = parsed.data;

  if (!isValidPinFormat(pin)) {
    return NextResponse.json(
      { error: `Il PIN deve essere di ${PIN_LENGTH} cifre.` },
      { status: 400 },
    );
  }

  const admin = serviceClient();
  const { data, error } = await admin
    .rpc("register_with_league", {
      p_invite_code: normalizeInviteCode(inviteCode),
      p_username: username,
      p_pin_hash: await hashPin(pin),
    })
    .single();

  if (error || !data) {
    const message = error?.message ?? "";
    if (message.includes("INVITE_CODE_NOT_FOUND")) {
      return NextResponse.json({ error: "Codice non riconosciuto." }, { status: 404 });
    }
    if (message.includes("USERNAME_TAKEN")) {
      return NextResponse.json(
        { error: "Questo nome utente è già preso. Scegline un altro." },
        { status: 409 },
      );
    }
    if (message.includes("LEAGUE_FULL")) {
      return NextResponse.json(
        { error: "La lega è al completo (10 giocatori)." },
        { status: 409 },
      );
    }
    console.error("[/api/auth/register] iscrizione fallita:", error);
    return NextResponse.json(
      { error: "Non è stato possibile completare l'iscrizione." },
      { status: 500 },
    );
  }

  const row = data as { player_id: string; league_id: string; username: string };

  await setSessionCookie(
    await createSessionToken({
      playerId: row.player_id,
      username: row.username,
      leagueId: row.league_id,
      displayName: row.username,
      isAdmin: false,
    }),
  );

  return NextResponse.json({ ok: true });
}
