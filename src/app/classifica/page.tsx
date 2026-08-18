import { redirect } from "next/navigation";
import { getSessionWithToken } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { computeStandings } from "@/lib/scoring";
import type { MatchScore, PlayerRef, StandingsRow } from "@/lib/scoring";

/**
 * Classifica generale e di giornata.
 *
 * L'ordinamento e gli spareggi non vengono ricalcolati qui: è la stessa
 * `computeStandings` coperta dai test di M1. Questa pagina legge i punteggi
 * e li passa alla funzione, punto.
 *
 * Nessun JavaScript lato client: si naviga con dei link, e su un telefono
 * in 3G si vede la differenza.
 */
export default async function ClassificaPage({
  searchParams,
}: {
  searchParams: Promise<{ giornata?: string }>;
}) {
  const auth = await getSessionWithToken();
  if (!auth) redirect("/entra");

  const { giornata } = await searchParams;
  const supabase = userClient(auth.token);

  const { data: league } = await supabase
    .from("leagues")
    .select("name, season")
    .eq("id", auth.session.leagueId)
    .maybeSingle();

  if (!league) redirect("/");

  const { data: members } = await supabase
    .from("league_members")
    .select("player_id, display_name")
    .eq("league_id", auth.session.leagueId);

  const players: PlayerRef[] = (members ?? []).map((m) => ({
    playerId: m.player_id as string,
    displayName: m.display_name as string,
  }));

  const { data: rows } = await supabase
    .from("v_scores_by_matchday")
    .select(
      "player_id, match_id, outcome_correct, exact, base_points, unique_bonus, points, matchday_number",
    )
    .eq("league_id", auth.session.leagueId)
    .eq("season", league.season);

  const all = rows ?? [];

  const toScore = (r: (typeof all)[number]): MatchScore => ({
    playerId: r.player_id as string,
    matchId: r.match_id as string,
    outcomeCorrect: r.outcome_correct as boolean,
    exact: r.exact as boolean,
    basePoints: r.base_points as number,
    uniqueBonus: r.unique_bonus as number,
    points: r.points as number,
  });

  const overall = computeStandings(all.map(toScore), players);

  const playedMatchdays = [
    ...new Set(all.map((r) => r.matchday_number as number)),
  ].sort((a, b) => a - b);

  const selected =
    giornata && playedMatchdays.includes(Number(giornata))
      ? Number(giornata)
      : (playedMatchdays.at(-1) ?? null);

  const matchdayStandings =
    selected === null
      ? null
      : computeStandings(
          all.filter((r) => r.matchday_number === selected).map(toScore),
          players,
        );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-4 pb-10">
      <header className="pt-4">
        <a href="/" className="text-sm text-slate-500 underline">
          ← Torna alla lega
        </a>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Classifica</h1>
        <p className="text-sm text-slate-500">
          {league.name} · stagione {league.season}
        </p>
      </header>

      {all.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
          Nessun punteggio ancora calcolato. La classifica compare dopo la
          prima giornata.
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-3 font-semibold">Generale</h2>
            <Table rows={overall} me={auth.session.playerId} />
            <p className="mt-2 text-xs text-slate-500">
              A parità di punti conta chi ha azzeccato più esiti, poi più
              risultati esatti.
            </p>
          </section>

          {selected !== null && matchdayStandings && (
            <section>
              <h2 className="mb-3 font-semibold">Per giornata</h2>

              <div className="mb-3 flex flex-wrap gap-2">
                {playedMatchdays.map((n) => (
                  <a
                    key={n}
                    href={`/classifica?giornata=${n}`}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${
                      n === selected
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {n}
                  </a>
                ))}
              </div>

              <Table rows={matchdayStandings} me={auth.session.playerId} />

              <a
                href="/pronostici"
                className="mt-3 block text-sm text-slate-600 underline"
              >
                Vedi chi ha pronosticato cosa
              </a>
              <a
                href="/statistiche"
                className="mt-2 block text-sm text-slate-600 underline"
              >
                Statistiche di lega
              </a>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Table({ rows, me }: { rows: StandingsRow[]; me: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li
          key={row.playerId}
          className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
            row.playerId === me
              ? "border-slate-900 bg-white"
              : "border-slate-200 bg-white"
          }`}
        >
          <span className="w-6 shrink-0 text-center font-semibold tabular-nums text-slate-500">
            {row.rank}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate ${row.playerId === me ? "font-bold" : "font-medium"}`}
            >
              {row.displayName}
            </span>
            <span className="text-xs text-slate-500">
              {row.outcomeCount} esiti · {row.exactCount} esatti
            </span>
          </span>
          <span className="shrink-0 text-xl font-bold tabular-nums">
            {row.points}
          </span>
        </li>
      ))}
    </ul>
  );
}
