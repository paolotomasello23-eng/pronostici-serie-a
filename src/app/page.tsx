import { redirect } from "next/navigation";
import { getSessionWithToken } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export default async function Home() {
  const auth = await getSessionWithToken();
  if (!auth) redirect("/entra");

  const { session, token } = auth;

  // Deliberatamente il client "utente" e non quello di servizio: se le policy
  // RLS fossero sbagliate, questa pagina resterebbe vuota. È il modo più
  // onesto di accorgersene subito invece che alla prima giornata di gioco.
  const supabase = userClient(token);

  const { data: league } = await supabase
    .from("leagues")
    .select("name, invite_code, season")
    .eq("id", session.leagueId)
    .maybeSingle();

  const { data: members } = await supabase
    .from("league_members")
    .select("display_name, role")
    .eq("league_id", session.leagueId)
    .order("display_name");

  if (!league) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-bold">Lega non raggiungibile</h1>
        <p className="mt-2 text-slate-600">
          La sessione è valida ma il database non restituisce la lega: di
          solito significa che le policy RLS non sono state applicate.
          Riesegui la migrazione SQL.
        </p>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <header className="pt-6">
        <p className="text-sm text-slate-500">Ciao {session.displayName}</p>
        <h1 className="text-2xl font-bold tracking-tight">{league.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Stagione {league.season}
          {session.isAdmin && " · sei l'amministratore"}
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">
          Codice d&apos;invito
        </p>
        <p className="mt-1 text-3xl font-bold tracking-[0.3em]">
          {league.invite_code}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Mandalo agli amici per farli entrare.
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">
          Giocatori ({members?.length ?? 0})
        </h2>
        <ul className="flex flex-col gap-2">
          {(members ?? []).map((member) => (
            <li
              key={member.display_name as string}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <span className="font-medium">{member.display_name}</span>
              {member.role === "admin" && (
                <span className="text-xs font-medium text-slate-500">admin</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 p-5 text-slate-500">
        <p className="font-medium text-slate-700">Prossima milestone</p>
        <p className="mt-1 text-sm">
          M3 — il calendario delle partite, scaricato da football-data.org con
          inserimento manuale come riserva.
        </p>
      </section>

      <div className="pb-8">
        <LogoutButton />
      </div>
    </main>
  );
}
