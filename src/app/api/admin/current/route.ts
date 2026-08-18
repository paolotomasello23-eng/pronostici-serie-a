import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { fetchCurrentSeason } from "@/lib/matches/football-data";
import { env } from "@/lib/env";

/** Stagione e giornata in corso secondo football-data, per non doverle indovinare. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: auth.status });
  }

  try {
    return NextResponse.json(await fetchCurrentSeason(env.footballDataApiKey));
  } catch (error) {
    console.error("[/api/admin/current] fallito:", error);
    // Se l'API non risponde, l'admin deve poter lavorare lo stesso: gli
    // proponiamo un valore ragionevole invece di bloccarlo.
    const now = new Date();
    return NextResponse.json({
      season: now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1,
      currentMatchday: 1,
      degraded: true,
    });
  }
}
