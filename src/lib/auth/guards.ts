import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { getSession, type Session } from "./session";

/**
 * Due livelli di amministrazione, perché i dati sono di due tipi.
 *
 *   admin di lega  ->  i giocatori della propria lega
 *   admin dell'app ->  calendario, risultati, blocchi: dati comuni a tutti
 *
 * Il token di sessione contiene già `is_admin`, ma è stato firmato al login
 * e da allora potrebbe essere cambiato tutto: qui i ruoli si rileggono dal
 * database, che è l'unico posto dove sono veri adesso.
 */

/**
 * L'admin dell'app gestisce calendario e risultati, che valgono per tutte
 * le leghe.
 *
 * Se la colonna non esiste ancora (migrazione 0015 non eseguita) la
 * risposta è no: nel dubbio nessuno tocca i dati di tutti, e il calendario
 * continua ad aggiornarsi da solo con i sync automatici.
 */
export async function isAppAdmin(playerId: string): Promise<boolean> {
  const { data, error } = await serviceClient()
    .from("players")
    .select("is_app_admin")
    .eq("id", playerId)
    .maybeSingle();

  if (error) {
    console.error("[guards] ruolo di admin dell'app non leggibile:", error.message);
    return false;
  }
  return data?.is_app_admin === true;
}

export async function requireAppAdmin(): Promise<
  { ok: true; session: Session } | { ok: false; status: 401 | 403 }
> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401 };
  if (!(await isAppAdmin(session.playerId))) return { ok: false, status: 403 };
  return { ok: true, session };
}

/**
 * Chi può gestire i giocatori della lega attiva: il suo admin, oppure
 * l'admin dell'app (che deve poter aiutare chi ha perso il PIN anche in
 * una lega dove gioca e basta).
 */
export async function requireAdmin(): Promise<
  | {
      ok: true;
      session: Session & { leagueId: string };
      isLeagueAdmin: boolean;
      isAppAdmin: boolean;
    }
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

  // Bisogna comunque far parte della lega: un token con una lega da cui si
  // è usciti non dà diritti su quella lega.
  if (!data) return { ok: false, status: 403 };

  const isLeagueAdmin = data.role === "admin";
  const appAdmin = await isAppAdmin(session.playerId);

  if (!isLeagueAdmin && !appAdmin) return { ok: false, status: 403 };

  return {
    ok: true,
    session: { ...session, leagueId: session.leagueId },
    isLeagueAdmin,
    isAppAdmin: appAdmin,
  };
}
