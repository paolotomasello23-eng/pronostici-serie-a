import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { getSession, type Session } from "./session";

/**
 * Verifica che chi sta chiamando sia l'admin della lega.
 *
 * Il token di sessione contiene già `is_admin`, ma è stato firmato al
 * login e da allora potrebbe essere cambiato tutto: qui il ruolo si
 * rilegge dal database, che è l'unico posto dove è vero adesso.
 */
export async function requireAdmin(): Promise<
  | { ok: true; session: Session & { leagueId: string } }
  | { ok: false; status: 401 | 403 }
> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401 };
  // Senza una lega attiva non c'è niente da amministrare.
  if (!session.leagueId) return { ok: false, status: 403 };

  const { data } = await serviceClient()
    .from("league_members")
    .select("role")
    .eq("league_id", session.leagueId)
    .eq("player_id", session.playerId)
    .maybeSingle();

  if (data?.role !== "admin") return { ok: false, status: 403 };

  return { ok: true, session: { ...session, leagueId: session.leagueId } };
}
