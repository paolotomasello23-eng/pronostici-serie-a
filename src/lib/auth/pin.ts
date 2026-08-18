import "server-only";
import bcrypt from "bcryptjs";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PIN a 6 cifre: un milione di combinazioni. Poche, se qualcuno può provarle
 * tutte — quindi il freno ai tentativi qui sotto non è un dettaglio, è ciò
 * che rende accettabile un PIN così corto.
 */
export const PIN_LENGTH = 6;

const BCRYPT_ROUNDS = 10;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export type PinCheck =
  | { ok: true }
  | { ok: false; reason: "wrong"; attemptsLeft: number }
  | { ok: false; reason: "locked"; until: Date };

/**
 * Verifica il PIN e tiene il conto dei tentativi falliti.
 *
 * Dopo 5 errori il giocatore resta fuori per 15 minuti. Un blocco temporaneo
 * e non permanente: l'obiettivo è rendere impraticabile provare i PIN a
 * tappeto, non chiudere fuori l'amico smemorato fino a nuovo ordine.
 *
 * Richiede il client con service_role: l'hash del PIN è l'unica cosa che
 * nessun giocatore deve poter leggere, nemmeno la propria.
 */
export async function verifyPin(
  admin: SupabaseClient,
  playerId: string,
  pin: string,
): Promise<PinCheck> {
  const { data: player, error } = await admin
    .from("players")
    .select("pin_hash, failed_attempts, locked_until")
    .eq("id", playerId)
    .single();

  if (error || !player) return { ok: false, reason: "wrong", attemptsLeft: 0 };

  if (player.locked_until && new Date(player.locked_until) > new Date()) {
    return { ok: false, reason: "locked", until: new Date(player.locked_until) };
  }

  if (await bcrypt.compare(pin, player.pin_hash)) {
    await admin
      .from("players")
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", playerId);
    return { ok: true };
  }

  const attempts = (player.failed_attempts ?? 0) + 1;
  const shouldLock = attempts >= MAX_ATTEMPTS;

  await admin
    .from("players")
    .update({
      failed_attempts: shouldLock ? 0 : attempts,
      locked_until: shouldLock
        ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
        : null,
    })
    .eq("id", playerId);

  if (shouldLock) {
    return {
      ok: false,
      reason: "locked",
      until: new Date(Date.now() + LOCK_MINUTES * 60_000),
    };
  }

  return { ok: false, reason: "wrong", attemptsLeft: MAX_ATTEMPTS - attempts };
}
