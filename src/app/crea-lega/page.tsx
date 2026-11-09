import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

/**
 * Indirizzo di quando l'app aveva una lega sola, creata una volta per tutte
 * da qui. Oggi una lega la crea chiunque: dalla schermata iniziale chi
 * arriva da zero, da "Le mie leghe" chi ha già un account.
 *
 * La pagina vecchia diceva "Lega già creata, si può fare una volta sola":
 * falso da quando le leghe sono libere. Chi ci arriva da un vecchio link
 * finisce dove la creazione si fa davvero.
 */
export default async function CreaLegaPage() {
  const session = await getSession();
  redirect(session ? "/leghe" : "/entra");
}
