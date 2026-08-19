import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStandings } from "@/lib/scoring";
import type { MatchScore, PlayerRef } from "@/lib/scoring";
import { sendToPlayer } from "./send";

/**
 * Avvisa la lega che la giornata è chiusa, dicendo a ognuno com'è andata.
 *
 * È l'unica notifica che non chiede niente: le altre servono a ricordarti di
 * giocare, questa arriva quando non c'è più nulla da fare ed è solo una
 * soddisfazione — o una delusione, ma di quelle che uno vuole sapere subito.
 *
 * Parte una volta sola per giornata, con lo stesso lucchetto dei promemoria:
 * la riga scritta prima dell'invio.
 */
export async function notifyResults(
  admin: SupabaseClient,
  params: { leagueId: string; matchdayId: string; matchdayNumber: number; season: number },
): Promise<number> {
  const { leagueId, matchdayId, matchdayNumber, season } = params;

  const { data: members } = await admin
    .from("league_members")
    .select("player_id, display_name")
    .eq("league_id", leagueId);

  const players: PlayerRef[] = (members ?? []).map((m) => ({
    playerId: m.player_id as string,
    displayName: m.display_name as string,
  }));

  if (players.length === 0) return 0;

  const { data: righe } = await admin
    .from("v_scores_by_matchday")
    .select(
      "player_id, match_id, outcome_correct, exact, base_points, unique_bonus, points, matchday_number",
    )
    .eq("league_id", leagueId)
    .eq("season", season);

  const tutte = righe ?? [];

  const toScore = (r: (typeof tutte)[number]): MatchScore => ({
    playerId: r.player_id as string,
    matchId: r.match_id as string,
    outcomeCorrect: r.outcome_correct as boolean,
    exact: r.exact as boolean,
    basePoints: r.base_points as number,
    uniqueBonus: r.unique_bonus as number,
    points: r.points as number,
  });

  const diGiornata = computeStandings(
    tutte.filter((r) => r.matchday_number === matchdayNumber).map(toScore),
    players,
  );
  const generale = computeStandings(tutte.map(toScore), players);

  const puntiGiornata = new Map(diGiornata.map((r) => [r.playerId, r.points]));
  const posizione = new Map(generale.map((r) => [r.playerId, r.rank]));

  let inviate = 0;

  for (const player of players) {
    const punti = puntiGiornata.get(player.playerId) ?? 0;
    const posto = posizione.get(player.playerId) ?? players.length;

    const { error: giaInviata } = await admin.from("push_reminders").insert({
      matchday_id: matchdayId,
      player_id: player.playerId,
      kind: "risultati",
    });

    if (giaInviata) continue;

    const esito = await sendToPlayer(admin, player.playerId, {
      title: `Giornata ${matchdayNumber}: ${punti} punt${punti === 1 ? "o" : "i"}`,
      body: `Sei ${posto}° in classifica generale`,
      url: "/classifica",
      tag: `risultati-${matchdayId}`,
    });

    if (esito.sent > 0) inviate++;
  }

  return inviate;
}
