import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Gli endpoint di sincronizzazione sono su un URL pubblico: senza questo
 * controllo, chiunque conoscesse l'indirizzo potrebbe farli girare a
 * ripetizione e bruciare il nostro rate limit su football-data.
 *
 * Il confronto è a tempo costante. È una cautela abbondante per un gioco tra
 * amici, ma costa una riga: un confronto normale si ferma al primo carattere
 * diverso, e la differenza di tempo racconta quanti caratteri erano giusti.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim() === "") return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : header;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
