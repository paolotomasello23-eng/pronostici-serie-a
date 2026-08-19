import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { serviceClient } from "@/lib/supabase/server";
import { sendToPlayer } from "@/lib/push/send";
import { predictionsOpenAt } from "@/lib/matches/types";

/**
 * I promemoria prima del blocco.
 *
 * Tre chiamate, pensate su un principio solo: una notifica deve dire a chi
 * la riceve qualcosa che lo riguarda. Le prime due partono soltanto per chi
 * ha ancora partite in bianco e portano il suo nome e il suo numero; l'ultima
 * va a tutti, ma cambia testo a seconda che tu abbia finito o no.
 *
 * Il motivo non è cortesia: chi riceve avvisi che non lo riguardano
 * disattiva le notifiche, e poi non riceve nemmeno quella che gli serviva.
 */

/**
 * Fascia di silenzio, in ore italiane.
 *
 * Una giornata che comincia alle 12:30 avrebbe la prima chiamata alle 4:30
 * del mattino. Chi dorme non compila pronostici, e chi viene svegliato da
 * un'app la disinstalla: in quella fascia non parte niente, e le finestre
 * qui sotto fanno sì che l'avviso parta comunque appena il silenzio finisce.
 */
const SILENZIO_DA = 23;
const SILENZIO_A = 8;

interface Contesto {
  nome: string;
  mancanti: number;
  giornata: number;
  /** Ora del blocco, già scritta all'italiana: "18:30". */
  oraBlocco: string;
  oreMancanti: number;
}

const FASI = [
  {
    kind: "8h",
    /** Otto ore prima, o appena finisce il silenzio notturno. */
    da: 2.5,
    a: 8,
    soloIncompleti: true,
    messaggio: (c: Contesto) => ({
      title:
        c.mancanti === 1
          ? `${c.nome}, manca un pronostico`
          : `${c.nome}, mancano ${c.mancanti} pronostici`,
      body: `La giornata ${c.giornata} si chiude alle ${c.oraBlocco}`,
    }),
  },
  {
    kind: "2h",
    da: 0.6,
    a: 2.5,
    soloIncompleti: true,
    messaggio: (c: Contesto) => ({
      title: `Svegliaaa ${c.nome}!!!`,
      body:
        c.mancanti === 1
          ? "Ti manca un solo pronostico, si chiude fra un paio d'ore"
          : `Hai ancora ${c.mancanti} partite da compilare, si chiude fra un paio d'ore`,
    }),
  },
  {
    kind: "30m",
    da: 0,
    a: 0.6,
    soloIncompleti: false,
    messaggio: (c: Contesto) => ({
      title: c.mancanti > 0 ? `Ultimi minuti, ${c.nome}!` : "Ci siamo",
      body:
        c.mancanti > 0
          ? `${c.mancanti} partite in bianco valgono zero`
          : "Avrai messo le scelte giuste?? Fra poco si chiude",
    }),
  },
] as const;

/**
 * Per quanto tempo dopo l'apertura ha senso annunciarla.
 *
 * Se il controllo non gira per qualche ora — la fascia di silenzio, un
 * guasto — l'annuncio parte comunque, purché non troppo tardi: "la giornata
 * è aperta" detto due giorni dopo non è una notizia.
 */
const RITARDO_MAX_APERTURA_ORE = 12;

/** L'ora attuale in Italia, per sapere se siamo nella fascia di silenzio. */
function oraItaliana(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}

function formattaOra(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const admin = serviceClient();

  try {
    const now = new Date();
    const ora = oraItaliana(now);

    if (ora >= SILENZIO_DA || ora < SILENZIO_A) {
      return NextResponse.json({
        ok: true,
        message: `Fascia di silenzio (${ora}:00 in Italia): nessun invio.`,
      });
    }

    // ---- Annuncio di apertura ----
    // Le giornate la cui finestra si è aperta da poco: si guarda molto più
    // avanti degli otto ore dei promemoria, perché l'apertura cade cinque
    // giorni prima del blocco.
    const { data: aperte } = await admin
      .from("matchdays")
      .select("id, number, lock_at")
      .gt("lock_at", now.toISOString())
      .lte("lock_at", new Date(now.getTime() + 6 * 86_400_000).toISOString());

    let annunci = 0;

    for (const giornata of aperte ?? []) {
      const apertura = predictionsOpenAt(giornata.lock_at as string).getTime();
      const daQuando = (now.getTime() - apertura) / 3_600_000;

      if (daQuando < 0 || daQuando > RITARDO_MAX_APERTURA_ORE) continue;

      const { data: membri } = await admin
        .from("league_members")
        .select("player_id");

      for (const membro of membri ?? []) {
        const { error: giaFatto } = await admin.from("push_reminders").insert({
          matchday_id: giornata.id as string,
          player_id: membro.player_id as string,
          kind: "apertura",
        });
        if (giaFatto) continue;

        const esito = await sendToPlayer(admin, membro.player_id as string, {
          title: `Giornata ${giornata.number} aperta`,
          body: "Puoi mettere i tuoi pronostici",
          url: `/pronostici?giornata=${giornata.number}`,
          tag: `apertura-${giornata.id}`,
        });
        if (esito.sent > 0) annunci++;
      }
    }

    // ---- Promemoria prima del blocco ----
    const massimo = new Date(now.getTime() + 8 * 3_600_000);

    const { data: matchdays } = await admin
      .from("matchdays")
      .select("id, number, lock_at")
      .gt("lock_at", now.toISOString())
      .lte("lock_at", massimo.toISOString());

    if (!matchdays || matchdays.length === 0) {
      return NextResponse.json({
        ok: true,
        annunci,
        message: "Nessun blocco in vista.",
      });
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
          ...fase.messaggio({
            nome: member.display_name as string,
            mancanti,
            giornata: matchday.number as number,
            oraBlocco: formattaOra(matchday.lock_at as string),
            oreMancanti,
          }),
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

    return NextResponse.json({ ok: true, annunci, fasi: report });
  } catch (error) {
    console.error("[cron/reminders] fallito:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
