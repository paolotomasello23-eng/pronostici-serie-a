# Pronostici Serie A

Pronostici di Serie A tra amici: ogni giornata 10 partite, ognuno indovina il
risultato esatto, il server blocca tutto al fischio d'inizio della prima
partita e a fine giornata aggiorna la classifica.

Regole, scelte tecniche e milestone: [`docs/decisioni.md`](docs/decisioni.md).

## Come si parte

Serve **Node.js 20 o superiore** ([nodejs.org](https://nodejs.org), versione LTS).

```bash
npm install
npm test
npm run dev
```

L'app risponde su http://localhost:3000.

Per provarla dal telefono, con computer e telefono sulla stessa rete WiFi:

```bash
npm run dev -- -H 0.0.0.0
```

poi apri `http://<ip-del-computer>:3000` dal telefono (l'IP lo trovi con
`ipconfig`, voce "Indirizzo IPv4").

## Configurazione

Copia `.env.local.example` in `.env.local` e riempilo man mano che le
milestone lo richiedono. **Il repository è pubblico: nessuna chiave nel
codice, mai.**

## Struttura

```
src/lib/scoring/    motore di punteggio — funzioni pure, nessun DB
tests/              test del motore, eseguibili senza infrastruttura
src/app/            interfaccia Next.js (App Router)
docs/               decisioni di progetto
```

## Test

```bash
npm test
```

Il motore di punteggio è codice puro: niente database, niente rete. È la
parte del sistema dove un errore rovina il gioco senza farsi notare, quindi
è quella coperta per prima e più a fondo.
