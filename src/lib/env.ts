import "server-only";

/**
 * Variabili d'ambiente, lette in un posto solo e con un errore chiaro se
 * mancano. Meglio un messaggio esplicito all'avvio che un "undefined" che
 * si manifesta tre schermate più in là.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Variabile d'ambiente mancante: ${name}. Controlla il file .env.local e riavvia "npm run dev".`,
    );
  }
  return value.trim();
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  /** Salta tutte le policy RLS: solo lato server, mai vicino al browser. */
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  /** Con questo firmiamo i token di sessione che Supabase poi riconosce. */
  get supabaseJwtSecret() {
    return required("SUPABASE_JWT_SECRET");
  },
  /** Chiave football-data.org: solo server, mai esposta al browser. */
  get footballDataApiKey() {
    return required("FOOTBALL_DATA_API_KEY");
  },
};
