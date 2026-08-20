import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionWithToken } from "@/lib/auth/session";
import { serviceClient, userClient } from "@/lib/supabase/server";
import { arePredictionsOpen, predictionsOpenAt } from "@/lib/matches/types";

/**
 * Pronostici: lettura e scrittura.
 *
 * Tutto passa dal client "utente", quindi con RLS attiva. Non è un
 * dettaglio implementativo: significa che la segretezza dei pronostici e
 * l'immutabilità dopo il lock non dipendono dal codice qui sotto. Anche se
 * questa route avesse un buco, il database rifiuterebbe comunque.
 *
 * Il controllo esplicito del lock che trovi più sotto non è quindi la
 * difesa: serve a dare un messaggio comprensibile invece di un errore
 * criptico. La difesa è la policy in `predictions_insert` / `_update`.
 */

/**
 * I pronostici di una giornata.
 *
 * La query è identica prima e dopo il lock — cambia solo cosa il database
 * accetta di restituire: prima solo i tuoi, dopo quelli di tutti.
 */
export async function GET(request: Request) {
  const auth = await getSessionWithToken();
  if (!auth) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const leagueId = auth.session.leagueId;
  if (!leagueId) {
    return NextResponse.json({ error: "Nessuna lega selezionata." }, { status: 409 });
  }

  const matchdayId = new URL(request.url).searchParams.get("matchdayId");
  if (!matchdayId) {
    return NextResponse.json({ error: "Giornata non indicata." }, { status: 400 });
  }

  const supabase = userClient(auth.token);

  const { data: matchday } = await supabase
    .from("matchdays")
    .select("id, number, lock_at, status")
    .eq("id", matchdayId)
    .maybeSingle();

  if (!matchday) {
    return NextResponse.json({ error: "Giornata non trovata." }, { status: 404 });
  }

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, home_team_short, away_team_short, home_team, away_team, home_team_crest, away_team_crest, kickoff_at, status, home_goals, away_goals",
    )
    .eq("matchday_id", matchdayId)
    .order("kickoff_at");

  const matchIds = (matches ?? []).map((m) => m.id as string);

  const { data: tuttiPronostici } = matchIds.length
    ? await supabase
        .from("predictions")
        .select("match_id, player_id, home_goals, away_goals, outcome")
        .in("match_id", matchIds)
    : { data: [] };

  const lockAt = (matchday.lock_at as string | null) ?? null;
  const isLocked = !!lockAt && new Date(lockAt).getTime() <= Date.now();
  const isOpen = arePredictionsOpen(lockAt);
  const opensAt = lockAt ? predictionsOpenAt(lockAt).toISOString() : null;

  // Il pronostico è della persona e vale in tutte le sue leghe: chi gioca in
  // due gruppi vedrebbe qui anche i compagni dell'altro. Questa schermata
  // parla di una lega sola, quindi si tiene solo chi ne fa parte.
  const { data: members } = await supabase
    .from("league_members")
    .select("player_id, display_name")
    .eq("league_id", leagueId);

  const iscritti = new Set((members ?? []).map((m) => m.player_id as string));
  const predictions = (tuttiPronostici ?? []).filter((p) =>
    iscritti.has(p.player_id as string),
  );

  // I nomi servono solo a giornata bloccata, quando si vedono i pronostici
  // di tutti. Prima non c'è niente da etichettare.
  const names: Record<string, string> = isLocked
    ? Object.fromEntries(
        (members ?? []).map((m) => [
          m.player_id as string,
          m.display_name as string,
        ]),
      )
    : {};

  return NextResponse.json({
    matchday,
    isLocked,
    isOpen,
    opensAt,
    matches: matches ?? [],
    predictions,
    names,
    me: auth.session.playerId,
  });
}

const saveSchema = z.object({
  predictions: z
    .array(
      z.object({
        matchId: z.string().uuid(),
        homeGoals: z.number().int().min(0).max(20),
        awayGoals: z.number().int().min(0).max(20),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(request: Request) {
  const auth = await getSessionWithToken();
  if (!auth) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const leagueId = auth.session.leagueId;
  if (!leagueId) {
    return NextResponse.json({ error: "Nessuna lega selezionata." }, { status: 409 });
  }

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Pronostici non validi: i gol devono essere numeri interi da 0 a 20." },
      { status: 400 },
    );
  }

  const { predictions } = parsed.data;
  const matchIds = predictions.map((p) => p.matchId);

  // Controllo esplicito del lock, per poter dire *perché* il salvataggio
  // non è andato. Usa il client di servizio apposta: deve poter vedere
  // l'orario di blocco anche di una giornata che il giocatore non potrebbe
  // scrivere, per distinguere "bloccata" da "non esiste".
  const { data: rows } = await serviceClient()
    .from("matches")
    .select("id, matchdays(lock_at)")
    .in("id", matchIds);

  if ((rows ?? []).length !== matchIds.length) {
    return NextResponse.json(
      { error: "Una delle partite non esiste." },
      { status: 404 },
    );
  }

  const now = Date.now();

  const orariBlocco = (rows ?? []).map((row) => {
    // PostgREST restituisce la relazione come oggetto o come array di uno,
    // a seconda di come deduce la cardinalità: reggiamo entrambe le forme.
    const related = row.matchdays as
      | { lock_at: string | null }
      | { lock_at: string | null }[]
      | null;
    return Array.isArray(related) ? related[0]?.lock_at : related?.lock_at;
  });

  if (orariBlocco.some((lockAt) => !!lockAt && new Date(lockAt).getTime() <= now)) {
    return NextResponse.json(
      {
        error:
          "La giornata è bloccata: i pronostici non sono più modificabili.",
      },
      { status: 403 },
    );
  }

  // Non ancora aperta è un no diverso da "troppo tardi", e va detto così.
  const nonAncora = orariBlocco.find(
    (lockAt) => !arePredictionsOpen(lockAt ?? null),
  );
  if (nonAncora !== undefined) {
    const quando = nonAncora
      ? predictionsOpenAt(nonAncora).toLocaleDateString("it-IT", {
          timeZone: "Europe/Rome",
          day: "2-digit",
          month: "2-digit",
        })
      : null;
    return NextResponse.json(
      {
        error: quando
          ? `Questa giornata si apre il ${quando}.`
          : "Questa giornata non è ancora aperta.",
      },
      { status: 403 },
    );
  }

  const supabase = userClient(auth.token);

  const { data, error } = await supabase
    .from("predictions")
    .upsert(
      predictions.map((p) => ({
        player_id: auth.session.playerId,
        match_id: p.matchId,
        home_goals: p.homeGoals,
        away_goals: p.awayGoals,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "player_id,match_id" },
    )
    .select("match_id");

  if (error) {
    console.error("[/api/predictions] salvataggio rifiutato:", error);
    return NextResponse.json(
      {
        error:
          "Il database ha rifiutato il salvataggio. Se la giornata è appena iniziata, i pronostici sono ormai chiusi.",
      },
      { status: 403 },
    );
  }

  // Se RLS avesse silenziosamente scartato delle righe, il conteggio non
  // tornerebbe: meglio accorgersene qui che lasciar credere di aver salvato.
  if ((data ?? []).length !== predictions.length) {
    return NextResponse.json(
      { error: "Alcuni pronostici non sono stati salvati. Ricarica la pagina." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, saved: data?.length ?? 0 });
}
