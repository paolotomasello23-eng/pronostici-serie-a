import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/lib/supabase/server";
import { isValidPinFormat, verifyPin } from "@/lib/auth/pin";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";

const schema = z.object({
  username: z.string().trim().min(2).max(20),
  pin: z.string(),
});

/**
 * Accesso con nome utente e PIN.
 *
 * Non serve più il codice della lega: quello identifica una lega, non una
 * persona, e con il multi-lega la persona viene prima. Le leghe si scelgono
 * dopo, nella schermata che le elenca.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isValidPinFormat(parsed.data.pin)) {
    return NextResponse.json({ error: "Dati di accesso non validi." }, { status: 400 });
  }

  const { username, pin } = parsed.data;
  const admin = serviceClient();

  // Confronto senza distinzione tra maiuscole e minuscole, come l'indice
  // che garantisce l'unicità. `ilike` qui è al sicuro: lo username è
  // ripulito da zod e i caratteri jolly non superano la validazione.
  const { data: players } = await admin
    .from("players")
    .select("id, username")
    .ilike("username", username);

  const player = (players ?? []).find(
    (p) =>
      String(p.username).trim().toLocaleLowerCase("it") ===
      username.toLocaleLowerCase("it"),
  );

  if (!player) {
    return NextResponse.json(
      { error: "Nessun account con questo nome utente." },
      { status: 404 },
    );
  }

  const check = await verifyPin(admin, player.id as string, pin);

  if (!check.ok) {
    if (check.reason === "locked") {
      const minutes = Math.max(
        1,
        Math.ceil((check.until.getTime() - Date.now()) / 60_000),
      );
      return NextResponse.json(
        { error: `Troppi tentativi sbagliati. Riprova tra ${minutes} minuti.` },
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

  // Chi ha una lega sola entra direttamente: fargli scegliere da un elenco
  // di uno solo sarebbe un passaggio a vuoto ogni volta.
  const { data: memberships } = await admin
    .from("league_members")
    .select("league_id, display_name, role")
    .eq("player_id", player.id as string)
    .order("joined_at");

  const only = (memberships ?? []).length === 1 ? memberships![0] : null;

  await setSessionCookie(
    await createSessionToken({
      playerId: player.id as string,
      username: player.username as string,
      leagueId: only ? (only.league_id as string) : null,
      displayName: only
        ? (only.display_name as string)
        : (player.username as string),
      isAdmin: only ? only.role === "admin" : false,
    }),
  );

  return NextResponse.json({
    ok: true,
    leagues: (memberships ?? []).length,
    goToLeagues: !only,
  });
}
