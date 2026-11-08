# Mettere l'app online

Tre passaggi: il codice su GitHub, l'app su Vercel, i sync automatici. Tutto
gratis, nessuna carta di credito.

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

Nel repository GitHub: *Settings → Secrets and variables → Actions → New
repository secret*. Due segreti:

- `APP_URL` — l'indirizzo Vercel, **senza** barra finale
- `CRON_SECRET` — lo stesso valore che hai messo su Vercel

Poi vai in **Actions**, scegli *Sincronizza calendario* e premi *Run
workflow*: è il modo per verificare subito che funzioni, senza aspettare.
Un pallino verde significa che l'app ha risposto. Se è rosso, aprilo e leggi
l'errore — di solito è `APP_URL` con una barra di troppo o un segreto
copiato male.

Le due automazioni:

| Workflow | Quando | Cosa fa |
|---|---|---|
| Calendario | 06:00 e 18:00 UTC | partite e orari, quindi il momento del lock |
| Risultati | ogni 15 min ven–lun, 12–23 UTC | risultati finali e classifica |
| Promemoria | ogni 10 min, 5–23 UTC | apertura, promemoria prima del blocco |

Gli orari nei file sono UTC: l'Italia è avanti di un'ora d'inverno e due
d'estate.

## Cose che succederanno, prima o poi

**GitHub disattiva i workflow schedulati dopo 60 giorni senza commit.**
Capiterà a campionato in corso, durante una pausa. Il rimedio è un commit
qualsiasi, oppure riattivarli dalla scheda Actions. Se una domenica la
classifica non si aggiorna, guarda lì per prima cosa.

**Supabase mette in pausa i progetti fermi da una settimana.** Con il cron
del calendario che gira due volte al giorno non dovrebbe accadere, ma se
dopo una lunga sosta l'app dà errore, il progetto va risvegliato dalla
dashboard Supabase.

**I cron di GitHub non sono puntuali.** Sotto carico partono con qualche
minuto di ritardo: per una classifica che si aggiorna la domenica sera non
cambia niente.

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
