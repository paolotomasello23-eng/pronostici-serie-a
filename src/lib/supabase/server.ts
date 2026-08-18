import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Client con i privilegi pieni: salta ogni policy RLS.
 *
 * Serve solo per le operazioni che RLS non può permettere per definizione —
 * leggere l'hash di un PIN durante il login, scrivere i punteggi calcolati,
 * sincronizzare il calendario. Ogni altro accesso ai dati deve passare da
 * `userClient`, altrimenti le protezioni scritte nel database non servono
 * a niente.
 */
export function serviceClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Client che agisce per conto di un giocatore, con RLS attiva.
 *
 * È il client di default per tutto ciò che riguarda i dati di gioco: se il
 * database dice che un pronostico altrui non si può leggere prima del lock,
 * da qui non si legge, punto. Anche se la route sopra avesse un errore.
 */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
