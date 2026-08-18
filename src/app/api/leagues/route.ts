import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/lib/supabase/server";
import { hashPin, isValidPinFormat, PIN_LENGTH } from "@/lib/auth/pin";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { generateInviteCode } from "@/lib/leagues";

const schema = z.object({
  leagueName: z.string().trim().min(1).max(60),
  season: z.number().int().min(2000).max(2100),
  displayName: z.string().trim().min(2).max(20),
  pin: z.string(),
});

/** Esiste già una lega? Se sì, la creazione è chiusa. */
export async function GET() {
  const { count } = await serviceClient()
    .from("leagues")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({ exists: (count ?? 0) > 0 });
}

/**
 * Crea la lega e il suo admin.
 *
 * Funziona una volta sola: appena una lega esiste, la funzione SQL rifiuta
 * ogni altra chiamata. In pratica la userai in locale prima del deploy,
 * quindi nessuno può arrivare prima di te.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi." }, { status: 400 });
  }

  const { leagueName, season, displayName, pin } = parsed.data;

  if (!isValidPinFormat(pin)) {
    return NextResponse.json(
      { error: `Il PIN deve essere di ${PIN_LENGTH} cifre.` },
      { status: 400 },
    );
  }

  const admin = serviceClient();
  const inviteCode = generateInviteCode();

  const { data, error } = await admin
    .rpc("create_league_with_admin", {
      p_league_name: leagueName,
      p_season: season,
      p_invite_code: inviteCode,
      p_display_name: displayName,
      p_pin_hash: await hashPin(pin),
    })
    .single();

  if (error || !data) {
    if ((error?.message ?? "").includes("LEAGUE_ALREADY_EXISTS")) {
      return NextResponse.json(
        { error: "Una lega esiste già: entra con il codice d'invito." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Non è stato possibile creare la lega." },
      { status: 500 },
    );
  }

  const row = data as { player_id: string; league_id: string; display_name: string };

  await setSessionCookie(
    await createSessionToken({
      playerId: row.player_id,
      leagueId: row.league_id,
      displayName: row.display_name,
      isAdmin: true,
    }),
  );

  return NextResponse.json({ ok: true, inviteCode });
}
