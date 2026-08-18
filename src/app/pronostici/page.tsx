import { redirect } from "next/navigation";
import { getSessionWithToken } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { PronosticiForm } from "./form";

/**
 * Sceglie la giornata da giocare — la prima non ancora bloccata — e lascia
 * il resto al componente client.
 */
export default async function PronosticiPage() {
  const auth = await getSessionWithToken();
  if (!auth) redirect("/entra");

  const supabase = userClient(auth.token);

  const { data: league } = await supabase
    .from("leagues")
    .select("season")
    .eq("id", auth.session.leagueId)
    .maybeSingle();

  if (!league) redirect("/");

  const nowIso = new Date().toISOString();

  const { data: upcoming } = await supabase
    .from("matchdays")
    .select("id")
    .eq("season", league.season)
    .gt("lock_at", nowIso)
    .order("lock_at")
    .limit(1)
    .maybeSingle();

  const { data: latest } = upcoming
    ? { data: null }
    : await supabase
        .from("matchdays")
        .select("id")
        .eq("season", league.season)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle();

  const matchday = upcoming ?? latest;

  if (!matchday) {
    return (
      <main className="mx-auto max-w-md p-6">
        <a href="/" className="text-sm text-slate-500 underline">
          ← Torna alla lega
        </a>
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
          Nessuna giornata caricata.
        </p>
      </main>
    );
  }

  return <PronosticiForm matchdayId={matchday.id as string} />;
}
