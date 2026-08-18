# Decisioni di progetto

Le scelte prese all'inizio e il perché. Quando fra sei mesi ci chiederemo
"ma perché l'avevamo fatto così", la risposta sta qui.

## Vincoli

- **Costo zero.** Tutto dentro i free tier: Vercel, Supabase, GitHub Actions,
  football-data.org. Nessuna carta di credito.
- **Mobile-first.** Si gioca dal telefono. Tocchi grandi, poche schermate.
- **Gruppo chiuso.** 4–10 amici, una lega, un codice d'invito.

## Regole del gioco

- `+3` risultato esatto.
- `+1` esito 1/X/2 corretto ma risultato sbagliato. Non si somma con il +3.
- `+1` bonus a chi è l'**unico** ad aver azzeccato l'esito di quel match.
  Si somma: esito unico = 2, risultato esatto e unico = 4.
- Il bonus richiede almeno **3 pronostici** sulla partita
  (`leagues.unique_bonus_min_predictions`, modificabile dall'admin).
  Senza soglia, chi è l'unico ad aver compilato quella riga incasserebbe il
  bonus a tavolino.
- Chi non compila prende **0** sulle partite lasciate vuote, e non conta per
  il bonus. Salvataggio progressivo: non serve completare tutte e 10.

Spareggi in classifica, in ordine: punti → esiti azzeccati → risultati esatti
→ nome. A parità di tutti e tre i criteri sportivi la **posizione è
condivisa** (1, 2, 2, 4): l'ordine alfabetico decide solo come li mostriamo.

## Lock

- Tutta la giornata si blocca insieme, al **kickoff della prima partita**.
- `matchdays.lock_at` = minimo dei kickoff tra le partite non rinviate, e
  viene ricalcolato ad ogni sync **finché la giornata non è bloccata**. Dopo,
  è cristallizzato: non si riapre mai, qualunque cosa faccia il calendario.
- Prima del lock ognuno vede solo i propri pronostici. Dopo, tutti vedono tutto.

La regola è applicata su **due livelli indipendenti**: nelle API route e
nelle policy RLS di Postgres. Le route usano il JWT dell'utente, quindi RLS
resta attiva anche lì; la `service_role` key, che bypassa RLS, la tocca solo
il job di scoring. Se sbagliamo una route, il database dice comunque no.

## Autenticazione: codice lega + nome + PIN

Scelta per l'attrito minimo: nessuna email da aspettare, nessun SMTP da
configurare, nessun limite di free tier. Flusso: codice lega → scegli il tuo
nome dalla lista → PIN a 6 cifre.

Conseguenza tecnica: senza Supabase Auth non esiste `auth.uid()`. Firmiamo
noi il JWT con il `SUPABASE_JWT_SECRET` del progetto (`sub` = player_id,
`role` = authenticated); Supabase lo accetta come token legittimo e le policy
RLS funzionano come previsto.

Il PIN è salvato come hash bcrypt. Blocco progressivo dopo 5 tentativi
falliti: 6 cifre sono un milione di combinazioni, ma senza freno si provano
tutte. Il livello di sicurezza è quello adatto a un gruppo di amici — non
protegge da un amico che indovina il PIN di un altro.

## Dati

I dati "mondo" (partite, risultati) stanno in tabelle separate dai dati
"lega" (pronostici, punti). Una seconda lega un domani non duplicherebbe il
calendario, e i risultati restano una fonte di verità unica.

`prediction_scores` tiene una riga per (giocatore, partita) invece di un
totale per giornata. Costa qualche riga in più e in cambio dà due cose:
ricalcolo idempotente e **scoring incrementale** — una partita rinviata al
mercoledì non blocca la classifica del lunedì.

`sync_runs` e `audit_log` sembrano sovradimensionati per un gioco tra amici,
ma il giorno in cui qualcuno contesterà un risultato varranno il loro prezzo.

## Automazione

- Fonte: football-data.org free tier, competizione `SA`. Chiave solo lato
  server, mai nel frontend.
- La fonte dati sta dietro un'interfaccia: API e inserimento manuale sono
  intercambiabili. L'admin può sempre correggere partite e risultati a mano e
  forzare il ricalcolo.
- Non si assegnano punti finché la partita non è `FINISHED`.
- Scheduler: **GitHub Actions su repo pubblico** (minuti illimitati; su repo
  privato un cron frequente sforerebbe i 2.000 minuti/mese, perché ogni run
  viene fatturato con un minimo di 1 minuto). I workflow chiamano endpoint
  protetti da `CRON_SECRET`.

Poiché il repo è pubblico: nessun segreto nel codice, mai. Un hook di
pre-commit in `.githooks/` prova a intercettare gli incidenti.

Supabase free mette in pausa i progetti dopo ~7 giorni di inattività: in
pausa-campionato serve un ping settimanale, previsto in M7.

## Milestone

| # | Contenuto | Stato |
|---|---|---|
| M0 | Setup: Next.js, Tailwind, Vitest, repo | ✅ |
| M1 | Motore di punteggio puro + test | ✅ |
| M2 | Schema DB + RLS + login PIN + lega con codice invito | ✅ |
| M3 | Sync partite football-data + inserimento manuale | ✅ |
| M4 | Inserimento pronostici + lock server-side | ✅ |
| M5 | Sync risultati + scoring su DB + ricalcolo forzato | ✅ |
| M6 | Classifica generale + dettaglio giornata | ✅ |
| M7 | Scheduler + deploy + polish mobile | ✅ |

Istruzioni per la messa online: [`deploy.md`](deploy.md).

Il lock non si riapre da solo, ma l'admin può riallinearlo a mano dal
pannello: se scatta per sbaglio — un orario sbagliato, una prova finita
male — senza quella via d'uscita la giornata resterebbe murata per sempre.
Resta una decisione esplicita di una persona, tracciata nell'audit log.
