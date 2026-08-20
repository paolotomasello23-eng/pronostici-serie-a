import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/lib/supabase/server";
import { hashPin, isValidPinFormat, PIN_LENGTH } from "@/lib/auth/pin";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { generateInviteCode, normalizeInviteCode } from "@/lib/leagues";

const nomeUtente = z
  .string()
  .trim()
  .min(2)
  .max(20)
  // Niente spazi né simboli: il nome utente si digita al login, e un
  // carattere invisibile di troppo diventa un'ora di "non riesco a entrare".
  .regex(/^[\p{L}\p{N}_.-]+$/u, "caratteri non ammessi");

/** Chi arriva con un codice entra in una lega che esiste già. */
const schemaIngresso = z.object({
  mode: z.literal("join").optional(),
  inviteCode: z.string().min(1).max(20),
  username: nomeUtente,
  pin: z.string(),
});

/** Chi arriva da zero e crea la propria lega. */
const schemaCreazione = z.object({
  mode: z.literal("create"),
  leagueName: z.string().trim().min(2).max(60),
  username: nomeUtente,
  pin: z.string(),
});

/**
 * Primo accesso in assoluto.
 *
 * Due strade: con un codice si entra in una lega che esiste, altrimenti se
 * ne crea una e chi la crea ne diventa amministratore. In entrambi i casi
 * account e appartenenza nascono nella stessa transazione.
 */
export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  const creazione = schemaCreazione.safeParse(corpo);
  const ingresso = creazione.success ? null : schemaIngresso.safeParse(corpo);

  if (!creazione.success && !ingresso?.success) {
    return NextResponse.json(
      {
        error:
          "Nome utente non valido: da 2 a 20 caratteri, senza spazi né simboli.",
      },
      { status: 400 },
    );
  }

  const dati = creazione.success ? creazione.data : ingresso!.data!;
  const { username, pin } = dati;

  if (!isValidPinFormat(pin)) {
    return NextResponse.json(
      { error: `Il PIN deve essere di ${PIN_LENGTH} cifre.` },
      { status: 400 },
    );
  }

  const admin = serviceClient();
  const pinHash = await hashPin(pin);

  const { data, error } = creazione.success
    ? await admin
        .rpc("register_and_create_league", {
          p_username: username,
          p_pin_hash: pinHash,
          p_league_name: creazione.data.leagueName,
          p_invite_code: generateInviteCode(),
          p_season: stagioneCorrente(),
        })
        .single()
    : await admin
        .rpc("register_with_league", {
          p_invite_code: normalizeInviteCode(ingresso!.data!.inviteCode),
          p_username: username,
          p_pin_hash: pinHash,
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
    if (message.includes("NAME_TOO_SHORT")) {
      return NextResponse.json(
        { error: "Il nome della lega è troppo corto." },
        { status: 400 },
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

  const row = data as {
    player_id: string;
    league_id: string;
    username: string;
    invite_code?: string;
  };

  await setSessionCookie(
    await createSessionToken({
      playerId: row.player_id,
      username: row.username,
      leagueId: row.league_id,
      displayName: row.username,
      isAdmin: creazione.success,
    }),
  );

  // Il codice torna indietro solo a chi ha appena creato la lega: è quello
  // che dovrà mandare agli amici, e cercarlo dopo sarebbe un passaggio in più.
  return NextResponse.json({ ok: true, inviteCode: row.invite_code ?? null });
}

/** L'anno d'inizio della stagione in corso: da luglio in poi è quella nuova. */
function stagioneCorrente(): number {
  const oggi = new Date();
  return oggi.getUTCMonth() >= 6
    ? oggi.getUTCFullYear()
    : oggi.getUTCFullYear() - 1;
}
