import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { serviceClient } from "@/lib/supabase/server";
import { sendToPlayer } from "@/lib/push/send";

/** Quanto prima del blocco far partire il promemoria. */
const WINDOW_HOURS = 6;

/**
 * Avvisa chi non ha ancora finito di pronosticare.
 *
 * Parte solo nelle ore che precedono il blocco e solo per chi ha davvero
 * delle partite in bianco: una notifica a chi ha già compilato tutto è il
 * modo più rapido per far disattivare le notifiche a tutti.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const admin = serviceClient();

  try {
    const now = new Date();
    const until = new Date(now.getTime() + WINDOW_HOURS * 3_600_000);

    const { data: matchdays } = await admin
      .from("matchdays")
      .select("id, number, lock_at")
      .gt("lock_at", now.toISOString())
      .lte("lock_at", until.toISOString());

    if (!matchdays || matchdays.length === 0) {
      return NextResponse.json({ ok: true, message: "Nessun blocco in vista." });
    }

    const report: Array<{ matchday: number; notified: number; skipped: number }> = [];

    for (const matchday of matchdays) {
      const { data: matches } = await admin
        .from("matches")
        .select("id")
        .eq("matchday_id", matchday.id as string);

      const matchIds = (matches ?? []).map((m) => m.id as string);
      if (matchIds.length === 0) continue;

      const { data: members } = await admin
        .from("league_members")
        .select("player_id, league_id, display_name");

      const { data: predictions } = await admin
        .from("predictions")
        .select("player_id")
        .in("match_id", matchIds);

      const compiled = new Map<string, number>();
      for (const p of predictions ?? []) {
        const id = p.player_id as string;
        compiled.set(id, (compiled.get(id) ?? 0) + 1);
      }

      const hoursLeft = Math.max(
        1,
        Math.round(
          (new Date(matchday.lock_at as string).getTime() - now.getTime()) / 3_600_000,
        ),
      );

      let notified = 0;
      let skipped = 0;

      for (const member of members ?? []) {
        const playerId = member.player_id as string;
        const done = compiled.get(playerId) ?? 0;
        const missing = matchIds.length - done;

        if (missing <= 0) {
          skipped++;
          continue;
        }

        // L'inserimento è il lucchetto: se la riga c'è già, il promemoria
        // è partito e non si ripete. Prima di inviare, non dopo, così un
        // errore a metà non produce comunque un doppione.
        const { error: alreadySent } = await admin
          .from("push_reminders")
          .insert({
            matchday_id: matchday.id as string,
            player_id: playerId,
            kind: "lock",
          });

        if (alreadySent) {
          skipped++;
          continue;
        }

        const result = await sendToPlayer(admin, playerId, {
          title: `Giornata ${matchday.number}: mancano ${missing} pronostici`,
          body:
            hoursLeft <= 1
              ? "Si blocca tra meno di un'ora."
              : `Si blocca tra circa ${hoursLeft} ore.`,
          url: "/pronostici",
          tag: `lock-${matchday.id}`,
        });

        if (result.sent > 0) notified++;
      }

      report.push({ matchday: matchday.number as number, notified, skipped });
    }

    return NextResponse.json({ ok: true, matchdays: report });
  } catch (error) {
    console.error("[cron/reminders] fallito:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
