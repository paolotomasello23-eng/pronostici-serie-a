import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { serviceClient } from "@/lib/supabase/server";
import { applyMatchday, logSyncRun } from "@/lib/matches/apply";
import { fetchMatchdayFromApi } from "@/lib/matches/football-data";
import { recomputeMatchdayAllLeagues } from "@/lib/scoring/persist";
import { notifyIfComplete } from "@/lib/push/results";
import { env } from "@/lib/env";

/** Quante giornate incompiute guardare a ogni giro. */
const MAX_MATCHDAYS = 5;

/**
 * Scarica i risultati delle giornate iniziate ma non ancora chiuse, e
 * ricalcola i punteggi di ogni lega.
 *
 * Si ferma alle giornate già cominciate: prima del lock non c'è nulla da
 * assegnare. Una giornata resta in lavorazione finché tutte le sue partite
 * non sono concluse, così un recupero al mercoledì entra in classifica da
 * solo, senza bisogno che qualcuno se ne ricordi.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const admin = serviceClient();

  try {
    const nowIso = new Date().toISOString();

    // Giornate già iniziate a cui manca ancora qualche risultato. In ordine
    // di calendario e non di numero: la 38 della stagione scorsa, rimasta
    // in sospeso, passava davanti alla 1 di quella nuova e la teneva fuori.
    const { data: pending, error: pendingError } = await admin
      .from("matchdays")
      .select("id, season, number")
      .lte("lock_at", nowIso)
      .neq("status", "scored")
      .order("lock_at", { ascending: false })
      .limit(MAX_MATCHDAYS);

    if (pendingError) throw new Error(pendingError.message);

    if (!pending || pending.length === 0) {
      return NextResponse.json({ ok: true, message: "Nessuna giornata da chiudere." });
    }

    const report: Array<{
      matchday: number;
      finished: number;
      total: number;
      complete: boolean;
      api: "ok" | "error";
    }> = [];

    for (const day of pending) {
      const season = day.season as number;
      const number = day.number as number;
      let api: "ok" | "error" = "ok";

      // Il calendario passa dalla stessa funzione del sync: se una partita
      // è stata rinviata dopo il lock, lo stato si aggiorna e i suoi punti
      // semplicemente non vengono assegnati.
      //
      // Se football-data non risponde si va avanti lo stesso con i dati che
      // ci sono: è il caso in cui l'admin ha inserito i risultati a mano, e
      // fermarsi qui vorrebbe dire non contarli mai.
      try {
        const inputs = await fetchMatchdayFromApi(
          season,
          number,
          env.footballDataApiKey,
        );
        if (inputs.length > 0) {
          await applyMatchday(admin, { season, number, inputs, source: "api" });
        }
      } catch (error) {
        api = "error";
        console.error(`[cron/results] g${number}: aggiornamento da football-data non riuscito:`, error);
        await logSyncRun(admin, {
          kind: "results",
          matchdayId: day.id as string,
          status: "error",
          message: (error as Error).message.slice(0, 500),
        });
      }

      const scored = await recomputeMatchdayAllLeagues(admin, day.id as string);

      // Solo a giornata conclusa: avvisare a metà, quando mancano ancora
      // dei risultati, darebbe una classifica che cambia il giorno dopo.
      await notifyIfComplete(admin, scored);

      report.push({
        matchday: number,
        finished: scored.finishedMatches,
        total: scored.totalMatches,
        complete: scored.complete,
        api,
      });
    }

    await logSyncRun(admin, {
      kind: "results",
      status: "ok",
      message: `cron: ${report.map((r) => `g${r.matchday} ${r.finished}/${r.total}${r.api === "error" ? " (senza API)" : ""}`).join(", ")}`,
    });

    // I punti sono stati comunque rifatti con i dati presenti, ma se
    // football-data non ha risposto il workflow deve finire in rosso: è
    // l'unico modo perché qualcuno se ne accorga.
    const apiDown = report.some((r) => r.api === "error");
    return NextResponse.json(
      { ok: !apiDown, matchdays: report },
      { status: apiDown ? 502 : 200 },
    );
  } catch (error) {
    console.error("[cron/results] fallito:", error);
    await logSyncRun(admin, {
      kind: "results",
      status: "error",
      message: (error as Error).message.slice(0, 500),
    });
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
