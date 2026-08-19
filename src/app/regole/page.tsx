/**
 * Le regole, scritte per chi entra la prima volta.
 *
 * Pagina statica: nessuna query, nessun JavaScript. Deve aprirsi subito
 * anche dal telefono in mezzo al traffico.
 */
export default function RegolePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 p-5">
      <header className="pt-4">
        <h1 className="text-2xl font-bold tracking-tight">Come si gioca</h1>
      </header>

      <section className="flex flex-col gap-3">
        <p>
          Ogni giornata di Serie A ci sono 10 partite. Prima che si cominci,
          scrivi come pensi che finirà ognuna. Non basta dire chi vince: serve
          il risultato preciso, tipo <strong>2-1</strong>.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">I punti</h2>
        <ul className="flex flex-col gap-2">
          <li className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <span className="text-xl font-bold">3 punti</span>
            <span className="block text-sm text-slate-600">
              se azzecchi il risultato esatto
            </span>
          </li>
          <li className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <span className="text-xl font-bold">1 punto</span>
            <span className="block text-sm text-slate-600">
              se azzecchi solo chi vince (o il pareggio), ma sbagli il risultato
            </span>
          </li>
          <li className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <span className="text-xl font-bold">+2 bonus</span>
            <span className="block text-sm text-slate-600">
              ogni partita mette in palio 2 punti per chi va controcorrente:
              se sei l&apos;unico a indovinare li prendi tutti, se siete in
              due fate 1 punto a testa, se siete in tre o più non li prende
              nessuno
            </span>
          </li>
        </ul>
        <p className="text-sm text-slate-600">
          I primi due non si sommano: o 3 o 1. Il bonus invece si aggiunge.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Un esempio</h2>
        <p>
          Torino-Milan finisce <strong>2-1</strong>.
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="rounded-lg bg-white px-4 py-2 ring-1 ring-slate-200">
            Avevi scritto <strong>2-1</strong> → 3 punti
          </li>
          <li className="rounded-lg bg-white px-4 py-2 ring-1 ring-slate-200">
            Avevi scritto <strong>3-0</strong> → 1 punto (vinceva il Torino, ma
            non era quello il risultato)
          </li>
          <li className="rounded-lg bg-white px-4 py-2 ring-1 ring-slate-200">
            Avevi scritto <strong>1-2</strong> → 0 punti
          </li>
        </ul>
        <p className="text-sm text-slate-600">
          E se tutti avevano puntato sul Milan e solo tu sul Torino, ti prendi
          anche i 2 punti di bonus: 1+2 = <strong>3 punti</strong>, oppure
          3+2 = <strong>5 punti</strong> se avevi indovinato pure il
          risultato. Se invece anche un altro aveva detto Torino, il bonus si
          divide: 1 punto a testa. In tre o più non lo prende nessuno.
        </p>
        <p className="text-sm text-slate-600">
          Il bonus vale solo se almeno in tre hanno pronosticato quella
          partita.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Quando si compila</h2>
        <p>
          Quando vuoi, fino al fischio d&apos;inizio della{" "}
          <strong>prima partita</strong> della giornata — di solito il sabato
          pomeriggio. Fino a quel momento puoi cambiare idea quante volte ti
          pare.
        </p>
        <p>
          Poi si blocca tutto insieme e non si tocca più niente. Da lì in avanti
          i pronostici di tutti diventano visibili: prima del blocco nessuno può
          sbirciare quelli degli altri, nemmeno volendo.
        </p>
        <p className="text-sm text-slate-600">
          Non devi finire tutte e 10 in una volta: si salva da solo mentre
          scrivi. Le partite lasciate in bianco valgono zero.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">La classifica</h2>
        <p>
          Si aggiorna da sola quando le partite finiscono, senza che nessuno
          debba fare niente.
        </p>
        <p>
          A pari punti passa avanti chi ha indovinato più esiti (chi vinceva o
          pareggiava). Se siete ancora pari, chi ha più risultati esatti.
        </p>
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
