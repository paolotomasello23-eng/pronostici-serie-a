import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStandings } from "@/lib/scoring";
import type { MatchScore, PlayerRef } from "@/lib/scoring";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { sendToPlayer } from "./send";

/**
 * Avvisa la lega che la giornata è chiusa, dicendo a ognuno com'è andata.
 *
 * È l'unica notifica che non chiede niente: le altre servono a ricordarti di
 * giocare, questa arriva quando non c'è più nulla da fare ed è solo una
 * soddisfazione — o una delusione, ma di quelle che uno vuole sapere subito.
 *
 * Parte una volta sola per giornata e per lega, con lo stesso lucchetto dei
 * promemoria: la riga scritta prima dell'invio.
 */
export async function notifyResults(
  admin: SupabaseClient,
  params: { leagueId: string; matchdayId: string; matchdayNumber: number; season: number },
): Promise<number> {
  const { leagueId, matchdayId, matchdayNumber, season } = params;

  const { data: league } = await admin
    .from("leagues")
    .select("name")
    .eq("id", leagueId)
    .maybeSingle();

  const members = await fetchAll<Record<string, unknown>>((from, to) =>
    admin
      .from("league_members")
      .select("player_id, display_name")
      .eq("league_id", leagueId)
      .order("player_id")
      .range(from, to),
  );

  const players: PlayerRef[] = members.map((m) => ({
    playerId: m.player_id as string,
    displayName: m.display_name as string,
  }));

  if (players.length === 0) return 0;

  // Tutta la stagione, a pagine: la posizione in classifica generale è
  // calcolata su ogni giornata, e oltre le 1000 righe una lettura singola
  // ne avrebbe tagliate via alcune, dando a ognuno un piazzamento sbagliato.
  const tutte = await fetchAll<Record<string, unknown>>((from, to) =>
    admin
      .from("v_scores_by_matchday")
      .select(
        "player_id, match_id, outcome_correct, exact, base_points, unique_bonus, points, matchday_number",
      )
      .eq("league_id", leagueId)
      .eq("season", season)
      .order("match_id")
      .order("player_id")
      .range(from, to),
  );

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

    // Una per lega: chi gioca in due gruppi ha due classifiche, e fino a
    // ieri riceveva soltanto quella della prima lega elaborata, senza
    // nemmeno sapere quale fosse.
    const { error: giaInviata } = await admin.from("push_reminders").insert({
      matchday_id: matchdayId,
      player_id: player.playerId,
      kind: `risultati:${leagueId}`,
    });

    if (giaInviata) continue;

    const esito = await sendToPlayer(admin, player.playerId, {
      title: `Giornata ${matchdayNumber}: ${punti} punt${punti === 1 ? "o" : "i"}`,
      body: league?.name
        ? `Sei ${posto}° in classifica generale in ${league.name as string}`
        : `Sei ${posto}° in classifica generale`,
      url: "/classifica",
      tag: `risultati-${matchdayId}-${leagueId}`,
    });

    if (esito.sent > 0) inviate++;
  }

  return inviate;
}

/**
 * Avvisa tutte le leghe ricalcolate, se la giornata è chiusa.
 *
 * Passa da qui chiunque chiuda una giornata — il controllo automatico come
 * il pannello admin. Se a chiuderla era il pannello, il controllo non ci
 * tornava più sopra e la notifica dei risultati non partiva mai.
 *
 * Un problema con le notifiche non deve mai far fallire chi ha appena
 * scritto i punti: si registra e si va avanti.
 */
export async function notifyIfComplete(
  admin: SupabaseClient,
  scored: { matchdayId: string; complete: boolean; leagueIds: string[] },
): Promise<number> {
  if (!scored.complete) return 0;

  try {
    const { data: day, error } = await admin
      .from("matchdays")
      .select("number, season")
      .eq("id", scored.matchdayId)
      .single();
    if (error || !day) throw new Error(error?.message ?? "giornata non trovata");

    let inviate = 0;
    for (const leagueId of scored.leagueIds) {
      inviate += await notifyResults(admin, {
        leagueId,
        matchdayId: scored.matchdayId,
        matchdayNumber: day.number as number,
        season: day.season as number,
      });
    }
    return inviate;
  } catch (error) {
    console.error("[push] notifica dei risultati non inviata:", error);
    return 0;
  }
}
