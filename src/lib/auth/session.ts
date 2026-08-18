import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "pronostici_session";

/** Sei mesi: il campionato dura meno, quindi si fa un login per stagione. */
const SESSION_DAYS = 180;

export interface Session {
  playerId: string;
  leagueId: string;
  displayName: string;
  isAdmin: boolean;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.supabaseJwtSecret);
}

/**
 * Firma il token di sessione con il JWT secret di Supabase.
 *
 * Il trucco che tiene in piedi tutto: firmando con la stessa chiave che usa
 * Supabase, il token è valido anche per PostgREST. Le policy RLS leggono
 * `sub` e ritrovano il nostro giocatore, esattamente come farebbero con
 * Supabase Auth — che qui non usiamo affatto.
 */
export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({
    role: "authenticated",
    league_id: session.leagueId,
    display_name: session.displayName,
    is_admin: session.isAdmin,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(session.playerId)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      audience: "authenticated",
    });

    if (!payload.sub || typeof payload.league_id !== "string") return null;

    return {
      playerId: payload.sub,
      leagueId: payload.league_id,
      displayName: String(payload.display_name ?? ""),
      isAdmin: payload.is_admin === true,
    };
  } catch {
    // Token scaduto, manomesso o firmato con un'altra chiave: in ogni caso
    // non è una sessione valida e non c'è altro da dire.
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** La sessione corrente, o null se non c'è. Usala nelle pagine server. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Sessione + token grezzo, per costruire un client Supabase con RLS attiva. */
export async function getSessionWithToken(): Promise<
  { session: Session; token: string } | null
> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  return session ? { session, token } : null;
}
