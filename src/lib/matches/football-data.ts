import "server-only";
import type { MatchInput, MatchStatus } from "./types";

/**
 * Client per football-data.org.
 *
 * Il piano gratuito concede 10 richieste al minuto: noi ne facciamo un paio
 * a settimana, quindi il limite non è un problema — ma un 429 va comunque
 * gestito, perché arriva quando meno serve (di lunedì sera, mentre il cron
 * prova a chiudere la giornata).
 */

const BASE_URL = "https://api.football-data.org/v4";
const COMPETITION = "SA"; // Serie A
const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4;

export class FootballDataError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "FootballDataError";
  }
}

interface ApiTeam {
  name?: string;
  shortName?: string;
}

interface ApiMatch {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: ApiTeam;
  awayTeam: ApiTeam;
  score?: { fullTime?: { home: number | null; away: number | null } };
}

const KNOWN_STATUSES: readonly string[] = [
  "SCHEDULED", "TIMED", "IN_PLAY", "PAUSED",
  "FINISHED", "POSTPONED", "SUSPENDED", "CANCELLED",
];

function toStatus(raw: string): MatchStatus {
  // "AWARDED" (vittoria a tavolino) e qualunque stato nuovo che l'API
  // introducesse: meglio trattarli come "non ancora finita" che assegnare
  // punti su un risultato che non sappiamo leggere.
  return (KNOWN_STATUSES.includes(raw) ? raw : "SCHEDULED") as MatchStatus;
}

async function request(path: string, apiKey: string): Promise<unknown> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: { "X-Auth-Token": apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });

      if (response.ok) return response.json();

      // 429 e 5xx passano: è il tipo di guaio che si risolve aspettando.
      // 401 e 404 no: riprovare con la stessa chiave sbagliata o la stessa
      // giornata inesistente darebbe lo stesso esito quattro volte.
      const retryable = response.status === 429 || response.status >= 500;
      const detail = await response.text().catch(() => "");
      lastError = new FootballDataError(
        `football-data ha risposto ${response.status}. ${detail.slice(0, 200)}`,
        response.status,
      );
      if (!retryable) throw lastError;
    } catch (error) {
      if (error instanceof FootballDataError && error.httpStatus && error.httpStatus < 500 && error.httpStatus !== 429) {
        throw error;
      }
      lastError = error as Error;
    }

    if (attempt < MAX_ATTEMPTS) {
      // 1s, 2s, 4s: sufficiente perché una finestra di rate limit si riapra.
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }

  throw lastError ?? new FootballDataError("football-data non raggiungibile.");
}

/** Le partite di una giornata, già normalizzate. */
export async function fetchMatchdayFromApi(
  season: number,
  matchday: number,
  apiKey: string,
): Promise<MatchInput[]> {
  const data = (await request(
    `/competitions/${COMPETITION}/matches?season=${season}&matchday=${matchday}`,
    apiKey,
  )) as { matches?: ApiMatch[] };

  const matches = data.matches ?? [];

  return matches.map((m) => {
    const fullTime = m.score?.fullTime;
    return {
      externalId: String(m.id),
      homeTeam: m.homeTeam.name ?? "Squadra casa",
      homeTeamShort: m.homeTeam.shortName ?? m.homeTeam.name ?? "Casa",
      awayTeam: m.awayTeam.name ?? "Squadra trasferta",
      awayTeamShort: m.awayTeam.shortName ?? m.awayTeam.name ?? "Trasferta",
      kickoffAt: m.utcDate,
      status: toStatus(m.status),
      homeGoals: fullTime?.home ?? null,
      awayGoals: fullTime?.away ?? null,
    } satisfies MatchInput;
  });
}

/** La stagione in corso secondo football-data (l'anno d'inizio). */
export async function fetchCurrentSeason(
  apiKey: string,
): Promise<{ season: number; currentMatchday: number }> {
  const data = (await request(`/competitions/${COMPETITION}`, apiKey)) as {
    currentSeason?: { startDate?: string; currentMatchday?: number | null };
  };

  const startDate = data.currentSeason?.startDate;
  return {
    season: startDate ? new Date(startDate).getUTCFullYear() : new Date().getUTCFullYear(),
    currentMatchday: data.currentSeason?.currentMatchday ?? 1,
  };
}
