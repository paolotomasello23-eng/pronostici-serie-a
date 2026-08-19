import { redirect } from "next/navigation";
import { getSessionWithToken } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { TeamCrest } from "@/components/team-crest";
import { Countdown } from "@/components/countdown";
import { AppMenu } from "@/components/app-menu";
import {
  arePredictionsOpen,
  isMatchdayVisible,
  predictionsOpenAt,
} from "@/lib/matches/types";
import { Avatar } from "@/components/avatar";

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
  if (!auth.session.leagueId) redirect("/leghe");

  const { session, token } = auth;

  // Deliberatamente il client "utente" e non quello di servizio: se le policy
  // RLS fossero sbagliate, questa pagina resterebbe vuota. È il modo più
  // onesto di accorgersene subito invece che alla prima giornata di gioco.
  const supabase = userClient(token);

  const { data: league } = await supabase
    .from("leagues")
    .select("name, season")
    .eq("id", session.leagueId)
    .maybeSingle();

  const { data: members } = await supabase
    .from("league_members")
    .select("player_id, display_name, role")
    .eq("league_id", session.leagueId)
    .order("display_name");

  if (!league) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-bold">Lega non raggiungibile</h1>
        <p className="mt-2 text-slate-600">
          La sessione è valida ma il database non restituisce la lega: di
          solito significa che le migrazioni SQL non sono state applicate
          tutte.
        </p>
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

  // Se la prossima giornata non è ancora visibile si resta sull'ultima
  // conosciuta: annunciare una giornata che l'app non mostra ancora sarebbe
  // solo un rimando a vuoto.
  const prossima = upcoming ?? latest;
  const matchday =
    prossima && isMatchdayVisible((prossima.lock_at as string | null) ?? null)
      ? prossima
      : ((
          await supabase
            .from("matchdays")
            .select("id, number, lock_at, status")
            .eq("season", league.season)
            .lte("lock_at", nowIso)
            .order("lock_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data ?? prossima);

  const { data: matches } = matchday
    ? await supabase
        .from("matches")
        .select(
          "id, home_team_short, away_team_short, home_team, away_team, home_team_crest, away_team_crest, kickoff_at, status, home_goals, away_goals",
        )
        .eq("matchday_id", matchday.id)
        .order("kickoff_at")
    : { data: null };

  const lockAt = (matchday?.lock_at as string | null) ?? null;
  const isLocked = !!lockAt && new Date(lockAt).getTime() <= Date.now();
  const isOpen = arePredictionsOpen(lockAt);

  const { data: avatars } = await supabase
    .from("v_member_avatars")
    .select("player_id, avatar_url")
    .eq("league_id", session.leagueId);

  const avatarOf = new Map(
    (avatars ?? []).map((a) => [a.player_id as string, a.avatar_url as string | null]),
  );

  const { count: myPredictions } =
    matchday && !isLocked && (matches ?? []).length > 0
      ? await supabase
          .from("predictions")
          .select("id", { count: "exact", head: true })
          .eq("player_id", session.playerId)
          .in(
            "match_id",
            (matches ?? []).map((m) => m.id as string),
          )
      : { count: null };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-4 pb-10">
      <header className="flex items-start justify-between gap-3 pt-3">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-bold tracking-tight">
            Ciao{" "}
            <span className={session.isAdmin ? "text-amber-500" : undefined}>
              {session.displayName}
            </span>
          </h1>
        </div>
        <AppMenu isAdmin={session.isAdmin} />
      </header>

      {matchday ? (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Giornata {matchday.number}</h2>
            {isLocked && (
              <span className="text-sm font-medium text-amber-700">
                Bloccata
              </span>
            )}
          </div>

          {matchday.lock_at && !isLocked && !isOpen && (
            <p className="mb-4 text-center text-sm text-slate-500">
              I pronostici si aprono il{" "}
              {formatRome(predictionsOpenAt(matchday.lock_at as string).toISOString())}
            </p>
          )}

          {matchday.lock_at && !isLocked && isOpen && (
            <div className="mb-4">
              <Countdown
                lockAt={matchday.lock_at as string}
                compiled={myPredictions ?? undefined}
                total={(matches ?? []).length || undefined}
              />
            </div>
          )}

          <a
            href="/pronostici"
            className="mb-4 block rounded-xl bg-slate-900 px-5 py-4 text-center text-lg font-semibold text-white active:bg-slate-700"
          >
            {isLocked
              ? "Vedi i pronostici di tutti"
              : isOpen
                ? "Fai i tuoi pronostici"
                : "Vedi le partite"}
          </a>

          <ul className="flex flex-col gap-2">
            {(matches ?? []).map((m, index) => (
              <li
                key={m.id as string}
                // Righe a tono alternato: su dieci partite di fila l'occhio
                // si perde, e una riga più chiara ogni due fa da guida.
                className={`rounded-xl border border-slate-200 px-4 py-3 ${
                  index % 2 === 0 ? "bg-slate-100" : "bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    <TeamCrest
                      src={m.home_team_crest as string | null}
                      name={(m.home_team_short as string) ?? (m.home_team as string)}
                      size={22}
                    />
                    <span className="truncate">
                      {(m.home_team_short as string) ?? m.home_team}
                    </span>
                    <span className="text-slate-400">–</span>
                    <TeamCrest
                      src={m.away_team_crest as string | null}
                      name={(m.away_team_short as string) ?? (m.away_team as string)}
                      size={22}
                    />
                    <span className="truncate">
                      {(m.away_team_short as string) ?? m.away_team}
                    </span>
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
                    {m.status === "POSTPONED"
                      ? "Rinviata"
                      : m.status === "SUSPENDED"
                        ? "Sospesa"
                        : "Annullata"}
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

      <section>
        <h2 className="mb-3 font-semibold">Giocatori ({members?.length ?? 0})</h2>
        <ul className="flex flex-col gap-2">
          {(members ?? []).map((member) => {
            const isMe = member.player_id === session.playerId;
            return (
              <li
                key={member.player_id as string}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                  isMe ? "border-slate-900 bg-white" : "border-slate-200 bg-white"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar
                    src={avatarOf.get(member.player_id as string)}
                    name={member.display_name as string}
                    size={36}
                  />
                  <span
                    className={`truncate ${isMe ? "font-bold" : "font-medium"} ${
                      member.role === "admin" ? "text-amber-500" : ""
                    }`}
                  >
                    {member.display_name}
                    {isMe && (
                      <span className="ml-2 text-xs font-medium text-slate-500">
                        tu
                      </span>
                    )}
                  </span>
                </span>
                {member.role === "admin" && (
                  <span className="text-xs font-medium text-amber-600">
                    admin
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
