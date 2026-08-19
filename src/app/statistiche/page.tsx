import { redirect } from "next/navigation";
import { getSessionWithToken } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { computePlayerStats, computeStatLeaderboards } from "@/lib/scoring/stats";
import type { ScoreWithMatchday } from "@/lib/scoring/stats";
import type { PlayerRef } from "@/lib/scoring";
import { StatCard } from "./stat-card";

/**
 * Statistiche di lega.
 *
 * I conti li fa `computePlayerStats`, che è coperta dai test: qui si legge
 * dal database e si disegna. Nessun calcolo in questa pagina.
 */
export default async function StatistichePage() {
  const auth = await getSessionWithToken();
  if (!auth) redirect("/entra");
  if (!auth.session.leagueId) redirect("/leghe");

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

  const { data: avatars } = await supabase
    .from("v_member_avatars")
    .select("player_id, avatar_url")
    .eq("league_id", auth.session.leagueId);

  const avatarOf = new Map(
    (avatars ?? []).map((a) => [a.player_id as string, a.avatar_url as string | null]),
  );

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
  const leaderboards = computeStatLeaderboards(stats);
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
        <div className="flex flex-col gap-3">
          {leaderboards.map((stat) => (
            <StatCard
              key={stat.key}
              stat={stat}
              me={auth.session.playerId}
              avatarOf={avatarOf}
            />
          ))}
        </div>
      )}
    </main>
  );
}
