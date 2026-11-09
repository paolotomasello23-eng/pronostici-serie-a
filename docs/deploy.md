# Mettere l'app online

Tre passaggi: il codice su GitHub, l'app su Vercel, i sync automatici in
Supabase. Tutto gratis, nessuna carta di credito.

## 1. GitHub

Crea un repository **pubblico** su [github.com/new](https://github.com/new) —
niente README, niente .gitignore, il progetto ce li ha già. Poi, dalla
cartella del progetto:

```bash
git remote add origin https://github.com/TUO-UTENTE/NOME-REPO.git
git branch -M main
git push -u origin main
```

Pubblico serve perché le GitHub Actions siano illimitate. Le chiavi non sono
nel codice: stanno in `.env.local`, che git ignora. Chi guarda il repository
vede lo schema del database, e non ci fa nulla — la sicurezza sta nelle
chiavi e nelle policy RLS.

Prima di pubblicare, un controllo che costa dieci secondi:

```bash
git ls-files | grep -i env
```

Deve comparire **solo** `.env.local.example`. Se compare `.env.local`, fermati.

## 2. Vercel

Su [vercel.com](https://vercel.com) accedi con GitHub, *Add New → Project* e
scegli il repository. Framework e comandi vengono riconosciuti da soli.

Prima di premere *Deploy*, apri **Environment Variables** e incolla i valori
dal tuo `.env.local`:

| Variabile | Dove trovarla |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` |
| `SUPABASE_JWT_SECRET` | `.env.local` |
| `FOOTBALL_DATA_API_KEY` | `.env.local` |
| `CRON_SECRET` | `.env.local` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `.env.local` |
| `VAPID_PRIVATE_KEY` | `.env.local` |
| `VAPID_SUBJECT` | `.env.local` |

Servono tutte: senza, l'app parte e poi fallisce alla prima richiesta.

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` va impostata **prima** del deploy, non dopo:
le variabili con quel prefisso finiscono dentro il codice consegnato al
browser al momento della compilazione. Aggiungerla più tardi richiede di
rilanciare il deploy.

A deploy finito hai un indirizzo tipo `https://nome-progetto.vercel.app`.
Aprilo dal telefono e aggiungilo alla schermata Home: su iPhone *Condividi →
Aggiungi a Home*, su Android il menu dei tre puntini. Diventa un'icona come
un'app qualsiasi.

## 3. Sync automatici

Girano dentro Supabase, con `pg_cron`: ogni tanto il database chiama gli
indirizzi `/api/cron/...` dell'app, con la chiave `CRON_SECRET`. All'inizio
stavano su GitHub Actions, ma GitHub li ha disattivati dopo 60 giorni senza
commit e, anche quando erano attivi, ne eseguiva solo una piccola parte.

Nell'SQL Editor di Supabase, una volta sola, salva i due valori nel Vault
(con quelli veri, mai nel codice):

```sql
select vault.create_secret('https://nome-progetto.vercel.app', 'pronostici_app_url');
select vault.create_secret('VALORE-DI-CRON_SECRET', 'pronostici_cron_secret');
```

Poi esegui la migrazione `0016_cron_in_supabase.sql`, che programma i job:

| Job | Quando (UTC) | Cosa fa |
|---|---|---|
| `pronostici-calendario` | 06:00 e 18:00 | partite e orari, quindi il momento del lock |
| `pronostici-risultati-weekend` | ogni 15 min ven–lun, 12–23 | risultati finali e classifica |
| `pronostici-risultati-settimana` | ogni 30 min mar–mer, 18–22 | turni infrasettimanali e recuperi |
| `pronostici-risultati-mattina` | 07:00 | ripassa quello che si fosse perso |
| `pronostici-promemoria` | ogni 10 min, 5–23 | apertura, promemoria prima del blocco |

L'Italia è avanti di un'ora d'inverno e due d'estate.

Per vedere se rispondono, le ultime chiamate e il loro esito:

```sql
select created, status_code, left(content, 200) as risposta
  from net._http_response order by created desc limit 20;
```

Un `200` vuol dire che l'app ha risposto. `401` è un `CRON_SECRET` sbagliato,
nessuna riga o un errore di connessione di solito è l'indirizzo dell'app.

I workflow in `.github/workflows` restano per l'avvio a mano dalla scheda
Actions (servono i segreti `APP_URL` e `CRON_SECRET` del repository).

## Controlli

Due query in `supabase/verifiche/`, da incollare nell'SQL Editor quando
qualcosa non torna. Non modificano niente.

- `giornate.sql` — per ogni giornata della stagione: blocco, ultimo
  aggiornamento, partite finite, pronostici e punteggi. Una giornata giocata
  con zero partite finite vuol dire che i sync non girano.
- `punteggi.sql` — ricalcola in SQL i punti di ogni lega con le regole del
  gioco e li confronta con quelli salvati. Dove dice `DA RICALCOLARE`, basta
  *Ricalcola e basta* su quella giornata dal pannello admin.

## Cose che succederanno, prima o poi

**Supabase mette in pausa i progetti fermi da una settimana.** Con il
calendario che si aggiorna due volte al giorno non dovrebbe accadere, ma se
dopo una lunga sosta l'app dà errore, il progetto va risvegliato dalla
dashboard Supabase.

**Se football-data non risponde**, resta il pannello admin: inserisci
risultati a mano e premi *Ricalcola e basta*. È il motivo per cui automatico
e manuale passano dalla stessa strada.

## Chi amministra cosa

Calendario e risultati sono uno solo per tutte le leghe, quindi li gestisce
solo l'**amministratore dell'app** (colonna `players.is_app_admin`). La
migrazione 0015 assegna il ruolo a chi ha creato la prima lega. Per darlo a
qualcun altro, dall'SQL Editor:

```sql
update players set is_app_admin = true where lower(username) = 'nome';
```

L'admin di una lega — cioè chiunque ne crei una — gestisce solo i giocatori
della propria: può dare un PIN nuovo a chi gioca soltanto nelle sue leghe.
Per chi è anche in leghe altrui serve l'amministratore dell'app.

## Aggiornare l'app

Ogni `git push` sul ramo `main` fa ripartire il deploy da solo. Le
migrazioni SQL no: quelle vanno eseguite a mano nell'SQL Editor di Supabase,
in ordine.
