import { redirect } from "next/navigation";
import { getSessionWithToken } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { PronosticiForm } from "./form";
import { isMatchdayVisible } from "@/lib/matches/types";

/**
 * Sceglie la giornata da mostrare e lascia il resto al componente client.
 *
 * Senza indicazioni mostra la prima non ancora bloccata — quella da
 * giocare. Con `?giornata=N` apre quella richiesta: serve a rivedere le
 * giornate passate, che altrimenti sparirebbero appena se ne apre una nuova.
 */
export default async function PronosticiPage({
  searchParams,
}: {
  searchParams: Promise<{ giornata?: string }>;
}) {
  const auth = await getSessionWithToken();
  if (!auth) redirect("/entra");
  if (!auth.session.leagueId) redirect("/leghe");

  const { giornata } = await searchParams;
  const supabase = userClient(auth.token);

  const { data: league } = await supabase
    .from("leagues")
    .select("season")
    .eq("id", auth.session.leagueId)
    .maybeSingle();

  if (!league) redirect("/");

  // Solo le giornate che hanno davvero delle partite: una riga creata e mai
  // popolata non è una giornata da mostrare.
  const { data: giornate } = await supabase
    .from("matchdays")
    .select("id, number, lock_at, matches(id)")
    .eq("season", league.season)
    .order("number");

  const disponibili = (giornate ?? [])
    .filter((g) => ((g.matches as { id: string }[]) ?? []).length > 0)
    .map((g) => ({
      id: g.id as string,
      number: g.number as number,
      lockAt: g.lock_at as string | null,
    }))
    // Le giornate troppo lontane non compaiono ancora: niente da fare, e
    // il selettore resterebbe pieno di numeri inerti.
    .filter((g) => isMatchdayVisible(g.lockAt));

  if (disponibili.length === 0) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
          Nessuna giornata caricata.
        </p>
      </main>
    );
  }

  const now = Date.now();
  const richiesta = giornata
    ? disponibili.find((g) => g.number === Number(giornata))
    : undefined;

  const daGiocare =
    disponibili.find((g) => g.lockAt && new Date(g.lockAt).getTime() > now) ??
    disponibili[disponibili.length - 1];

  const scelta = richiesta ?? daGiocare;

  return (
    <PronosticiForm
      matchdayId={scelta.id}
      giornate={disponibili.map((g) => ({ number: g.number }))}
      corrente={scelta.number}
    />
  );
}
