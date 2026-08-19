import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { serviceClient } from "@/lib/supabase/server";
import { sendToPlayer } from "@/lib/push/send";

/**
 * Le tre chiamate prima del blocco.
 *
 * Le finestre non si sovrappongono e ogni fase parte una volta sola per
 * giornata e per persona: la riga in `push_reminders` viene scritta prima
 * dell'invio, quindi un cron che gira ogni dieci minuti non produce dieci
 * notifiche uguali.
 *
 * Ordine dalla più lontana alla più vicina al fischio d'inizio.
 */
const FASI = [
  {
    kind: "8h",
    /** Vale quando mancano fra 4 e 8 ore. */
    da: 4,
    a: 8,
    /** A tutti, anche a chi ha già finito. */
    soloIncompleti: false,
    titolo: () => "8 ore al calcio d'inizio",
    testo: () => "Dai un'occhiata ai tuoi pronostici",
  },
  {
    kind: "4h",
    da: 0.5,
    a: 4,
    soloIncompleti: true,
    titolo: (nome: string) => `Svegliaaa ${nome}!!!!`,
    testo: (_nome: string, mancanti: number) =>
      `Devi ancora completare ${mancanti} pronostic${mancanti === 1 ? "o" : "i"}!`,
  },
  {
    kind: "30m",
    da: 0,
    a: 0.5,
    soloIncompleti: false,
    titolo: () => "Manca poco ormai",
    testo: () => "Avrai messo le scelte giuste??",
  },
] as const;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const admin = serviceClient();

  try {
    const now = new Date();
    const massimo = new Date(now.getTime() + 8 * 3_600_000);

    const { data: matchdays } = await admin
      .from("matchdays")
      .select("id, number, lock_at")
      .gt("lock_at", now.toISOString())
      .lte("lock_at", massimo.toISOString());

    if (!matchdays || matchdays.length === 0) {
      return NextResponse.json({ ok: true, message: "Nessun blocco in vista." });
    }

    const report: Array<{ matchday: number; fase: string; inviate: number }> = [];

    for (const matchday of matchdays) {
      const oreMancanti =
        (new Date(matchday.lock_at as string).getTime() - now.getTime()) / 3_600_000;

      const fase = FASI.find((f) => oreMancanti > f.da && oreMancanti <= f.a);
      if (!fase) continue;

      const { data: matches } = await admin
        .from("matches")
        .select("id")
        .eq("matchday_id", matchday.id as string);

      const matchIds = (matches ?? []).map((m) => m.id as string);
      if (matchIds.length === 0) continue;

      const { data: members } = await admin
        .from("league_members")
        .select("player_id, display_name");

      const { data: predictions } = await admin
        .from("predictions")
        .select("player_id")
        .in("match_id", matchIds);

      const compilati = new Map<string, number>();
      for (const p of predictions ?? []) {
        const id = p.player_id as string;
        compilati.set(id, (compilati.get(id) ?? 0) + 1);
      }

      let inviate = 0;

      for (const member of members ?? []) {
        const playerId = member.player_id as string;
        const nome = member.display_name as string;
        const mancanti = matchIds.length - (compilati.get(playerId) ?? 0);

        if (fase.soloIncompleti && mancanti <= 0) continue;

        // L'inserimento è il lucchetto: se la riga c'è già, quella fase è
        // partita e non si ripete. Prima di inviare, non dopo, così un
        // errore a metà non produce comunque un doppione.
        const { error: giaInviata } = await admin.from("push_reminders").insert({
          matchday_id: matchday.id as string,
          player_id: playerId,
          kind: fase.kind,
        });

        if (giaInviata) continue;

        const esito = await sendToPlayer(admin, playerId, {
          title: fase.titolo(nome),
          body: fase.testo(nome, mancanti),
          url: "/pronostici",
          tag: `${fase.kind}-${matchday.id}`,
        });

        if (esito.sent > 0) inviate++;
      }

      report.push({
        matchday: matchday.number as number,
        fase: fase.kind,
        inviate,
      });
    }

    return NextResponse.json({ ok: true, fasi: report });
  } catch (error) {
    console.error("[cron/reminders] fallito:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
