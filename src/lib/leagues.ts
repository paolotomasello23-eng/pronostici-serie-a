/**
 * Codice d'invito: 6 caratteri, senza le coppie che si confondono quando lo
 * si detta al telefono o lo si legge da uno screenshot (O/0, I/1, S/5).
 */
const ALPHABET = "ABCDEFGHJKLMNPQRTUVWXYZ23456789";

export function generateInviteCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}
