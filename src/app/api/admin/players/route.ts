import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceClient } from "@/lib/supabase/server";
import { hashPin, isValidPinFormat, PIN_LENGTH } from "@/lib/auth/pin";

/** I giocatori della lega, con lo stato dell'accesso. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: auth.status });
  }

  const admin = serviceClient();

  const { data: members } = await admin
    .from("league_members")
    .select("player_id, display_name, role")
    .eq("league_id", auth.session.leagueId)
    .order("display_name");

  const ids = (members ?? []).map((m) => m.player_id as string);

  const { data: players } = ids.length
    ? await admin
        .from("players")
        .select("id, username, failed_attempts, locked_until")
        .in("id", ids)
    : { data: [] };

  const byId = new Map((players ?? []).map((p) => [p.id as string, p]));

  return NextResponse.json({
    players: (members ?? []).map((m) => {
      const p = byId.get(m.player_id as string);
      const bloccatoFino = p?.locked_until as string | null | undefined;
      return {
        playerId: m.player_id as string,
        displayName: m.display_name as string,
        username: (p?.username as string) ?? null,
        isAdmin: m.role === "admin",
        failedAttempts: (p?.failed_attempts as number) ?? 0,
        lockedUntil:
          bloccatoFino && new Date(bloccatoFino) > new Date() ? bloccatoFino : null,
      };
    }),
  });
}

const schema = z.object({
  playerId: z.string().uuid(),
  pin: z.string(),
});

/**
 * Assegna un PIN nuovo a un giocatore.
 *
 * È l'unica via d'uscita per chi lo dimentica: nel database c'è solo
 * l'impronta del PIN, quindi quello vecchio non è recuperabile da nessuno —
 * si può soltanto sostituire.
 *
 * Azzera anche i tentativi falliti: chi ha appena riavuto il PIN non deve
 * trovarsi bloccato dai tentativi di quando non lo ricordava.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: auth.status });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi." }, { status: 400 });
  }

  const { playerId, pin } = parsed.data;

  if (!isValidPinFormat(pin)) {
    return NextResponse.json(
      { error: `Il PIN deve essere di ${PIN_LENGTH} cifre.` },
      { status: 400 },
    );
  }

  const admin = serviceClient();

  // Solo i giocatori della propria lega: un admin non deve poter cambiare
  // il PIN a qualcuno che sta altrove.
  const { data: membership } = await admin
    .from("league_members")
    .select("player_id, display_name")
    .eq("league_id", auth.session.leagueId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "Questo giocatore non è nella tua lega." },
      { status: 403 },
    );
  }

  const { error } = await admin
    .from("players")
    .update({
      pin_hash: await hashPin(pin),
      failed_attempts: 0,
      locked_until: null,
    })
    .eq("id", playerId);

  if (error) {
    console.error("[/api/admin/players] reset PIN fallito:", error);
    return NextResponse.json({ error: "Reimpostazione fallita." }, { status: 500 });
  }

  await admin.from("audit_log").insert({
    actor_id: auth.session.playerId,
    action: "player.reset_pin",
    entity: "player",
    entity_id: playerId,
    after: { display_name: membership.display_name },
  });

  return NextResponse.json({ ok: true });
}
