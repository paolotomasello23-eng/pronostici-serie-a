import { redirect } from "next/navigation";
import { getSessionWithToken } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

function formatRome(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
          solito significa che le migrazioni SQL non sono state applicate
          tutte. Controlla di aver eseguito la 0001, la 0002 e la 0003.
        </p>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </main>
    );
  }

  // La giornata da giocare è la prima non ancora bloccata. Se sono tutte
  // passate, mostriamo l'ultima: a campionato finito ha più senso vedere
  // com'è andata che una schermata vuota.
  const nowIso = new Date().toISOString();

  const { data: upcoming } = await supabase
    .from("matchdays")
    .select("id, number, lock_at, status")
    .eq("season", league.season)
    .gt("lock_at", nowIso)
    .order("lock_at")
    .limit(1)
    .maybeSingle();

  const { data: latest } = upcoming
    ? { data: null }
    : await supabase
        .from("matchdays")
        .select("id, number, lock_at, status")
        .eq("season", league.season)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle();

  const matchday = upcoming ?? latest;

  const { data: matches } = matchday
    ? await supabase
        .from("matches")
        .select(
          "id, home_team_short, away_team_short, home_team, away_team, kickoff_at, status, home_goals, away_goals",
        )
        .eq("matchday_id", matchday.id)
        .order("kickoff_at")
    : { data: null };

  const isLocked =
    !!matchday?.lock_at && new Date(matchday.lock_at).getTime() <= Date.now();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-4 pb-10">
      <header className="pt-4">
        <p className="text-sm text-slate-500">Ciao {session.displayName}</p>
        <h1 className="text-2xl font-bold tracking-tight">{league.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Stagione {league.season}
          {session.isAdmin && " · sei l'amministratore"}
        </p>
      </header>

      {matchday ? (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Giornata {matchday.number}</h2>
            <span
              className={`text-sm font-medium ${isLocked ? "text-amber-700" : "text-emerald-700"}`}
            >
              {isLocked ? "Bloccata" : "Aperta"}
            </span>
          </div>

          {matchday.lock_at && (
            <p className="mb-3 text-sm text-slate-500">
              {isLocked ? "Bloccata dal" : "Si blocca il"}{" "}
              {formatRome(matchday.lock_at)}
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {(matches ?? []).map((m) => (
              <li
                key={m.id as string}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    {(m.home_team_short as string) ?? m.home_team}
                    <span className="mx-1.5 text-slate-400">–</span>
                    {(m.away_team_short as string) ?? m.away_team}
                  </span>
                  {m.status === "FINISHED" ? (
                    <span className="shrink-0 font-semibold tabular-nums">
                      {m.home_goals}-{m.away_goals}
                    </span>
                  ) : (
                    <span className="shrink-0 text-sm text-slate-500 tabular-nums">
                      {formatRome(m.kickoff_at as string).replace(/^\w+ /, "")}
                    </span>
                  )}
                </div>
                {["POSTPONED", "SUSPENDED", "CANCELLED"].includes(
                  m.status as string,
                ) && (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    {m.status === "POSTPONED" ? "Rinviata" : m.status === "SUSPENDED" ? "Sospesa" : "Annullata"}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {(matches ?? []).length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
              Nessuna partita caricata per questa giornata.
            </p>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-slate-500">
          <p className="text-sm">
            Nessuna giornata caricata.
            {session.isAdmin && " Scaricala dal pannello admin."}
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">Codice d&apos;invito</p>
        <p className="mt-1 text-3xl font-bold tracking-[0.3em]">
          {league.invite_code}
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Giocatori ({members?.length ?? 0})</h2>
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

      <div className="flex items-center justify-between pt-2">
        {session.isAdmin ? (
          <a href="/admin" className="text-sm font-medium text-slate-700 underline">
            Pannello admin
          </a>
        ) : (
          <span />
        )}
        <LogoutButton />
      </div>
    </main>
  );
}
