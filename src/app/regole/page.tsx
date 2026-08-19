/**
 * Il regolamento.
 *
 * Pagina statica: nessuna query, nessun JavaScript. Deve aprirsi subito
 * anche dal telefono in mezzo al traffico.
 */

type IconProps = { className?: string };

/** Bersaglio: il risultato esatto. */
function TargetIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

/** Spunta: l'esito indovinato. */
function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m8.2 12.3 2.6 2.6 5-5.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Stella: il bonus competenza. */
function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85L12 3.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function RegolePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 p-5">
      <header className="pt-4">
        <h1 className="text-2xl font-bold tracking-tight">Regolamento</h1>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Modalità di gioco</h2>
        <p>
          Per ogni giornata di campionato, ciascun partecipante è tenuto a
          pronosticare il risultato esatto delle 10 partite di Serie A.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-slate-700 marker:text-slate-400">
          <li>
            I pronostici possono essere liberamente inseriti o modificati fino
            all&apos;orario ufficiale del fischio d&apos;inizio della prima
            giornata. Contestualmente all&apos;avvio della prima gara, il
            sistema bloccherà le partite e non sarà più possibile modificare i
            propri pronostici.
          </li>
          <li>
            Il salvataggio dei pronostici avviene in tempo reale e in modo
            automatico. Sarà infatti possibile pronosticare alcune partite in un
            momento ed altre in un altro.
          </li>
          <li>
            Gli incontri privi di pronostico al momento della chiusura
            comporteranno l&apos;assegnazione di 0 punti.
          </li>
          <li>
            Fino al momento del blocco definitivo i pronostici rimarranno
            riservati. A termini scaduti sarà possibile vedere i pronostici di
            tutti i partecipanti.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Calcolo dei punteggi</h2>
        <p className="text-sm text-slate-700">
          I punti assegnati per ciascun singolo incontro sono determinati dalle
          seguenti componenti.
        </p>

        <h3 className="mt-1 font-semibold">Punti base</h3>
        <ul className="flex flex-col gap-2">
          <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <TargetIcon className="mt-0.5 h-7 w-7 shrink-0 text-emerald-600" />
            <span className="min-w-0">
              <span className="block font-semibold">
                Risultato esatto: 3 punti
              </span>
              <span className="block text-xs text-slate-600">
                esatta corrispondenza tra pronostico e punteggio finale
              </span>
            </span>
          </li>
          <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <CheckIcon className="mt-0.5 h-7 w-7 shrink-0 text-sky-600" />
            <span className="min-w-0">
              <span className="block font-semibold">Esito: 1 punto</span>
              <span className="block text-xs text-slate-600">
                corretta individuazione della squadra vincente o del pareggio,
                ma con punteggio errato
              </span>
            </span>
          </li>
        </ul>

        <h3 className="mt-2 font-semibold">Bonus competenza</h3>
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <StarIcon className="mt-0.5 h-7 w-7 shrink-0 text-amber-500" />
          <div className="min-w-0">
            <p className="text-sm text-slate-700">
              Cumulabile con i punti base, viene distribuito ai concorrenti che
              indovinano l&apos;esito (o il risultato esatto) contro la
              maggioranza della lega, a condizione che almeno 3 partecipanti
              abbiano inserito un pronostico per la partita in questione.
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              <li className="flex items-baseline justify-between gap-3">
                <span className="text-slate-600">Unico vincitore</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  +2 punti
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3">
                <span className="text-slate-600">Due vincitori</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  +1 punto a testa
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3">
                <span className="text-slate-600">Tre o più vincitori</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  0 punti
                </span>
              </li>
            </ul>
          </div>
        </div>

        <p className="text-xs italic text-slate-500">
          Punteggio massimo teorico per singola gara: 5 punti, derivante da 3
          punti per il risultato esatto + 2 punti di bonus controcorrente.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Classifica generale</h2>
        <p className="text-sm text-slate-700">
          La classifica si aggiorna automaticamente al termine di ciascun
          incontro. In caso di parità di punteggio tra due o più concorrenti, si
          applicheranno nell&apos;ordine i seguenti criteri di spareggio:
        </p>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-slate-700 marker:font-semibold marker:text-slate-400">
          <li>Maggior numero complessivo di esiti indovinati;</li>
          <li>Maggior numero complessivo di risultati esatti indovinati.</li>
        </ol>
      </section>

      <div className="pb-4">
        <a
          href="/pronostici"
          className="block rounded-xl bg-slate-900 px-5 py-4 text-center text-lg font-semibold text-white active:bg-slate-700"
        >
          Vai ai pronostici
        </a>
      </div>
    </main>
  );
}
