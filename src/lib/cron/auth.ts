import "server-only";
import { timingSafeEqual } from "node:crypto";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Gli endpoint di sincronizzazione sono su un URL pubblico: senza questo
 * controllo, chiunque conoscesse l'indirizzo potrebbe farli girare a
 * ripetizione e bruciare il nostro rate limit su football-data.
 *
 * Due chiavi valgono:
 *
 *   - `CRON_SECRET`, la variabile d'ambiente di Vercel: la usano i workflow
 *     di GitHub, che la tengono fra i loro segreti;
 *   - la chiave che il database genera da sé e tiene nel Vault (migrazione
 *     0017): la usano i job di pg_cron, che stanno nello stesso database.
 *
 * La seconda esiste perché i job di Supabase non dovessero ricevere la
 * prima copiata a mano: è il passaggio che si sbaglia, e quando si sbaglia
 * i sync si fermano senza avvisare nessuno.
 */

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return (header.startsWith("Bearer ") ? header.slice(7) : header).trim();
}

/**
 * Confronto a tempo costante. È una cautela abbondante per un gioco tra
 * amici, ma costa una riga: un confronto normale si ferma al primo carattere
 * diverso, e la differenza di tempo racconta quanti caratteri erano giusti.
 */
function sameSecret(provided: string, secret: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function isAuthorizedCron(request: Request): Promise<boolean> {
  const provided = bearer(request);
  if (provided === "") return false;

  const secret = process.env.CRON_SECRET?.trim();
  if (secret && sameSecret(provided, secret)) return true;

  // Non è CRON_SECRET: può essere la chiave dei job di Supabase. La
  // confronta il database, che è l'unico a conoscerla.
  const { data, error } = await serviceClient().rpc("chiave_cron_valida", {
    p_chiave: provided,
  });
  if (error) {
    // Prima della migrazione 0017 la funzione non c'è ancora: vale solo
    // CRON_SECRET, come sempre.
    if (!/could not find|does not exist/i.test(error.message)) {
      console.error("[cron/auth] verifica della chiave non riuscita:", error.message);
    }
    return false;
  }
  return data === true;
}
