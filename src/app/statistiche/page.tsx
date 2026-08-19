import { redirect } from "next/navigation";
import { getSessionWithToken } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { computePlayerStats, computeTrophies } from "@/lib/scoring/stats";
import type { ScoreWithMatchday } from "@/lib/scoring/stats";
import type { PlayerRef } from "@/lib/scoring";

/**
 * Statistiche di lega.
 *
 * I conti li fa `computePlayerStats`, che è coperta dai test: qui si legge
 * dal database e si disegna. Nessun calcolo in questa pagina.
 */
export default async function StatistichePage() {
  const auth = await getSessionWithToken();
  if (!auth) redirect("/entra");

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

  const scores: ScoreWithMatchday[] = (rows ?? []).map((r) => ({
    playerId: r.player_id as string,
    matchId: r.match_id as string,
    outcomeCorrect: r.outcome_correct as boolean,
    exact: r.exact as boolean,
    basePoints: r.base_points as number,
    uniqueBonus: r.unique_bonus as number,
    points: r.points as number,
    matchdayNumber: r.matchday_number as number,
  }));

  const stats = computePlayerStats(scores, players);
  const trophies = computeTrophies(stats);
  const matchdays = new Set(scores.map((s) => s.matchdayNumber)).size;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-4 pb-10">
      <header className="pt-4">
        <h1 className="text-2xl font-bold tracking-tight">Statistiche</h1>
        <p className="text-sm text-slate-500">
          {matchdays === 0
            ? "nessuna giornata giocata"
            : matchdays === 1
              ? "1 giornata giocata"
              : `${matchdays} giornate giocate`}
        </p>
      </header>

      {scores.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
          Le statistiche compaiono dopo la prima giornata giocata.
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-3 font-semibold">Albo d&apos;oro</h2>
            <ul className="flex flex-col gap-2">
              {trophies.map((trophy) => (
                <li
                  key={trophy.key}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{trophy.title}</span>
                    <span className="shrink-0 text-sm font-medium text-slate-500">
                      {trophy.value}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{trophy.description}</p>
                  <p className="mt-1 font-medium">
                    {trophy.winners.join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-semibold">Numeri di ognuno</h2>
            <ul className="flex flex-col gap-3">
              {stats.map((player) => (
                <li
                  key={player.playerId}
                  className={`rounded-2xl border bg-white p-4 ${
                    player.playerId === auth.session.playerId
                      ? "border-slate-900"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{player.displayName}</span>
                    <span className="text-lg font-bold tabular-nums">
                      {player.points} pt
                    </span>
                  </div>

                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <Row label="Partite giocate" value={player.playedMatches} />
                    <Row label="Giornate" value={player.matchdaysPlayed} />
                    <Row label="Esiti azzeccati" value={player.outcomeCount} />
                    <Row label="Precisione" value={`${player.outcomeRate}%`} />
                    <Row label="Risultati esatti" value={player.exactCount} />
                    <Row label="Bonus unico" value={player.uniqueBonusCount} />
                    <Row
                      label="Media a giornata"
                      value={player.averagePerMatchday}
                    />
                    <Row label="Giornate vinte" value={player.matchdaysWon} />
                    <Row
                      label="Miglior giornata"
                      value={
                        player.bestMatchday
                          ? `${player.bestMatchday.points} pt (g${player.bestMatchday.number})`
                          : "—"
                      }
                    />
                    <Row label="Partite a zero" value={player.blanks} />
                  </dl>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="shrink-0 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
