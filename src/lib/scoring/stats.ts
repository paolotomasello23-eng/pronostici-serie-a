import type { MatchScore, PlayerRef } from "./types";

/**
 * Statistiche di lega.
 *
 * Come per la classifica, sono funzioni pure: ricevono i punteggi già letti
 * dal database e restituiscono numeri. Nessuna query qui dentro, così si
 * possono verificare con dei test invece che a occhio su dati veri.
 */

/** Un punteggio con l'informazione di quale giornata sia. */
export interface ScoreWithMatchday extends MatchScore {
  matchdayNumber: number;
}

export interface PlayerStats {
  playerId: string;
  displayName: string;
  /** Partite pronosticate e già valutate. */
  playedMatches: number;
  points: number;
  outcomeCount: number;
  exactCount: number;
  /** I +1 presi essendo l'unico ad averci visto giusto: il "trofeo competenza". */
  uniqueBonusCount: number;
  /** Giornate in cui ha giocato almeno una partita. */
  matchdaysPlayed: number;
  /** Punti per giornata giocata. Confronta chi ha saltato delle giornate. */
  averagePerMatchday: number;
  /** Percentuale di esiti azzeccati sulle partite giocate. */
  outcomeRate: number;
  bestMatchday: { number: number; points: number } | null;
  worstMatchday: { number: number; points: number } | null;
  /** Giornate chiuse col punteggio più alto della lega (ex aequo compresi). */
  matchdaysWon: number;
  /** Partite chiuse a zero punti. */
  blanks: number;
}

export function computePlayerStats(
  scores: readonly ScoreWithMatchday[],
  players: readonly PlayerRef[],
): PlayerStats[] {
  const byPlayer = new Map<string, PlayerStats>();
  const perMatchday = new Map<string, Map<number, number>>();

  for (const player of players) {
    byPlayer.set(player.playerId, {
      playerId: player.playerId,
      displayName: player.displayName,
      playedMatches: 0,
      points: 0,
      outcomeCount: 0,
      exactCount: 0,
      uniqueBonusCount: 0,
      matchdaysPlayed: 0,
      averagePerMatchday: 0,
      outcomeRate: 0,
      bestMatchday: null,
      worstMatchday: null,
      matchdaysWon: 0,
      blanks: 0,
    });
    perMatchday.set(player.playerId, new Map());
  }

  for (const score of scores) {
    const row = byPlayer.get(score.playerId);
    if (!row) continue;

    row.playedMatches += 1;
    row.points += score.points;
    if (score.outcomeCorrect) row.outcomeCount += 1;
    if (score.exact) row.exactCount += 1;
    if (score.uniqueBonus > 0) row.uniqueBonusCount += 1;
    if (score.points === 0) row.blanks += 1;

    const days = perMatchday.get(score.playerId)!;
    days.set(
      score.matchdayNumber,
      (days.get(score.matchdayNumber) ?? 0) + score.points,
    );
  }

  // Chi ha vinto ogni giornata, contando gli ex aequo: se due chiudono a
  // pari punti in cima, la giornata l'hanno vinta entrambi.
  const matchdayNumbers = [...new Set(scores.map((s) => s.matchdayNumber))];
  for (const number of matchdayNumbers) {
    let best = -1;
    const totals: Array<{ playerId: string; points: number }> = [];

    for (const [playerId, days] of perMatchday) {
      if (!days.has(number)) continue;
      const points = days.get(number)!;
      totals.push({ playerId, points });
      if (points > best) best = points;
    }

    // Una giornata in cui nessuno ha fatto punti non ha vincitori.
    if (best <= 0) continue;
    for (const entry of totals) {
      if (entry.points === best) byPlayer.get(entry.playerId)!.matchdaysWon += 1;
    }
  }

  for (const [playerId, row] of byPlayer) {
    const days = perMatchday.get(playerId)!;
    row.matchdaysPlayed = days.size;

    if (days.size > 0) {
      row.averagePerMatchday = round1(row.points / days.size);

      const entries = [...days.entries()].sort(
        (a, b) => b[1] - a[1] || a[0] - b[0],
      );
      const [bestNumber, bestPoints] = entries[0];
      const [worstNumber, worstPoints] = entries[entries.length - 1];
      row.bestMatchday = { number: bestNumber, points: bestPoints };
      row.worstMatchday = { number: worstNumber, points: worstPoints };
    }

    row.outcomeRate =
      row.playedMatches > 0
        ? round1((row.outcomeCount / row.playedMatches) * 100)
        : 0;
  }

  return [...byPlayer.values()].sort(
    (a, b) =>
      b.points - a.points ||
      a.displayName.localeCompare(b.displayName, "it", { sensitivity: "base" }),
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface Trophy {
  key: string;
  title: string;
  description: string;
  /** Chi guida, ex aequo compresi. Vuoto se non c'è ancora niente da premiare. */
  winners: string[];
  value: string;
}

/**
 * I primati da mostrare in cima alla pagina.
 *
 * Un primato con valore zero non viene assegnato: "vince chi ha zero
 * risultati esatti" non è un premio, è rumore.
 */
interface TrophyDefinition {
  key: string;
  title: string;
  description: string;
  /** Il numero da confrontare tra i giocatori. */
  pick: (stats: PlayerStats) => number;
  format: (value: number) => string;
}

export function computeTrophies(stats: readonly PlayerStats[]): Trophy[] {
  const trophies: TrophyDefinition[] = [
    {
      key: "competenza",
      title: "Competenza",
      description: "Più volte l'unico ad azzeccare una partita",
      pick: (s) => s.uniqueBonusCount,
      format: (n) => `${n} volte`,
    },
    {
      key: "esiti",
      title: "Occhio clinico",
      description: "Più esiti azzeccati",
      pick: (s) => s.outcomeCount,
      format: (n) => `${n} esiti`,
    },
    {
      key: "esatti",
      title: "Cecchino",
      description: "Più risultati esatti",
      pick: (s) => s.exactCount,
      format: (n) => `${n} esatti`,
    },
    {
      key: "giornate",
      title: "Dominatore",
      description: "Più giornate vinte",
      pick: (s) => s.matchdaysWon,
      format: (n) => `${n} giornate`,
    },
    {
      key: "media",
      title: "Regolarità",
      description: "Miglior media punti a giornata",
      pick: (s) => s.averagePerMatchday,
      format: (n) => `${n} a giornata`,
    },
    {
      key: "exploit",
      title: "Exploit",
      description: "La giornata più ricca di sempre",
      pick: (s) => s.bestMatchday?.points ?? 0,
      format: (n) => `${n} punti`,
    },
  ];

  return trophies
    .map(({ pick, format, ...meta }) => {
      const best = Math.max(0, ...stats.map(pick));
      const winners = stats.filter((s) => pick(s) === best && best > 0);
      return {
        ...meta,
        winners: winners.map((w) => w.displayName),
        value: format(best),
      };
    })
    .filter((t) => t.winners.length > 0);
}
