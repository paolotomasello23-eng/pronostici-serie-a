import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { hashPin, isValidPinFormat, PIN_LENGTH } from "@/lib/auth/pin";

/**
 * Chi può ricevere un PIN nuovo da chi.
 *
 * L'account è uno solo per tutte le leghe: chi ne ricava il PIN entra
 * ovunque quella persona giochi. Da quando chiunque può creare una lega,
 * lasciare questo potere a ogni admin di lega voleva dire che bastava farsi
 * aggiungere un amico al proprio gruppo per potergli prendere l'account —
 * leghe altrui comprese.
 *
 * Quindi: l'admin di una lega può reimpostarlo solo a chi gioca soltanto
 * in leghe che amministra lui. Per tutti gli altri serve l'admin dell'app.
 */
async function resettablePlayers(
  admin: ReturnType<typeof serviceClient>,
  requesterId: string,
  playerIds: string[],
): Promise<Set<string>> {
  if (playerIds.length === 0) return new Set();

  const [memberships, mine, appAdmins] = await Promise.all([
    // A gruppi: gli id finiscono nell'indirizzo della richiesta, e una lega
    // di qualche centinaio di persone ne supererebbe la lunghezza massima.
    Promise.all(
      chunks(playerIds, 100).map((gruppo) =>
        fetchAll<Record<string, unknown>>((from, to) =>
          admin
            .from("league_members")
            .select("league_id, player_id")
            .in("player_id", gruppo)
            .order("league_id")
            .order("player_id")
            .range(from, to),
        ),
      ),
    ).then((parti) => parti.flat()),
    admin
      .from("league_members")
      .select("league_id")
      .eq("player_id", requesterId)
      .eq("role", "admin"),
    // Gli admin dell'app sono uno o due: si leggono tutti, senza filtri.
    admin.from("players").select("id").eq("is_app_admin", true),
  ]);

  const amministrate = new Set((mine.data ?? []).map((r) => r.league_id as string));
  // Se la colonna non c'è ancora la lettura fallisce: nel dubbio, nessuno.
  const protetti = appAdmins.error
    ? new Set(playerIds)
    : new Set((appAdmins.data ?? []).map((r) => r.id as string));

  const fuoriPortata = new Set<string>();
  for (const row of memberships) {
    if (!amministrate.has(row.league_id as string)) {
      fuoriPortata.add(row.player_id as string);
    }
  }

  return new Set(
    playerIds.filter(
      (id) => id === requesterId || (!protetti.has(id) && !fuoriPortata.has(id)),
    ),
  );
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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

  const players = (
    await Promise.all(
      chunks(ids, 100).map(async (gruppo) => {
        const { data } = await admin
          .from("players")
          .select("id, username, failed_attempts, locked_until")
          .in("id", gruppo);
        return data ?? [];
      }),
    )
  ).flat();

  const byId = new Map(players.map((p) => [p.id as string, p]));

  const resettabili = auth.isAppAdmin
    ? new Set(ids)
    : await resettablePlayers(admin, auth.session.playerId, ids);

  return NextResponse.json({
    players: (members ?? []).map((m) => {
      const p = byId.get(m.player_id as string);
      const bloccatoFino = p?.locked_until as string | null | undefined;
      return {
        playerId: m.player_id as string,
        displayName: m.display_name as string,
        username: (p?.username as string) ?? null,
        isAdmin: m.role === "admin",
        canResetPin: resettabili.has(m.player_id as string),
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

  if (!auth.isAppAdmin) {
    const ammessi = await resettablePlayers(admin, auth.session.playerId, [playerId]);
    if (!ammessi.has(playerId)) {
      return NextResponse.json(
        {
          error:
            "Gioca anche in altre leghe: il suo PIN può reimpostarlo solo l'amministratore dell'app.",
        },
        { status: 403 },
      );
    }
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
