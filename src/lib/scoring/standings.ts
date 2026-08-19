import type { MatchScore, PlayerRef, StandingsRow } from "./types";

/**
 * Costruisce la classifica a partire dai punteggi per partita.
 *
 * Serve sia per la classifica generale sia per quella di giornata: la
 * differenza sta solo in quali `scores` passi. Filtrare è compito del
 * chiamante, così qui la logica di ordinamento resta una sola.
 *
 * Ordinamento (dal regolamento):
 *   1. punti totali, decrescente
 *   2. numero di esiti 1/X/2 azzeccati, decrescente
 *   3. numero di risultati esatti, decrescente
 *   4. nome, ordine alfabetico
 *
 * Tutti i giocatori passati in `players` compaiono in classifica, anche chi
 * non ha ancora pronosticato nulla: sta a 0 punti, non sparisce.
 */
export function computeStandings(
  scores: readonly MatchScore[],
  players: readonly PlayerRef[],
): StandingsRow[] {
  const byPlayer = new Map<string, StandingsRow>();

  for (const player of players) {
    byPlayer.set(player.playerId, {
      playerId: player.playerId,
      displayName: player.displayName,
      points: 0,
      outcomeCount: 0,
      exactCount: 0,
      bonusPoints: 0,
      scoredMatches: 0,
      rank: 0,
    });
  }

  for (const score of scores) {
    const row = byPlayer.get(score.playerId);
    if (!row) {
      // Punteggio di un giocatore che non è (più) nella lega: lo ignoriamo
      // invece di inventarci una riga con un nome che non abbiamo.
      continue;
    }
    row.points += score.points;
    row.scoredMatches += 1;
    if (score.outcomeCorrect) row.outcomeCount += 1;
    if (score.exact) row.exactCount += 1;
    row.bonusPoints += score.uniqueBonus;
  }

  const rows = [...byPlayer.values()].sort(compareStandingsRows);

  // Posizione condivisa quando i tre criteri sportivi coincidono: l'ordine
  // alfabetico decide come li mostriamo, non chi sta davanti davvero.
  let currentRank = 0;
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    const tiedWithPrevious =
      previous !== undefined &&
      previous.points === row.points &&
      previous.outcomeCount === row.outcomeCount &&
      previous.exactCount === row.exactCount;

    if (!tiedWithPrevious) currentRank = index + 1;
    row.rank = currentRank;
  });

  return rows;
}

function compareStandingsRows(a: StandingsRow, b: StandingsRow): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.outcomeCount !== b.outcomeCount) return b.outcomeCount - a.outcomeCount;
  if (a.exactCount !== b.exactCount) return b.exactCount - a.exactCount;

  const byName = a.displayName.localeCompare(b.displayName, "it", {
    sensitivity: "base",
  });
  if (byName !== 0) return byName;

  // Ultima spiaggia: due nomi identici a meno di accenti e maiuscole.
  // L'id garantisce che l'ordine sia comunque stabile e riproducibile.
  return a.playerId.localeCompare(b.playerId);
}
