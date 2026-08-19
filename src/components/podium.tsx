import { Avatar } from "@/components/avatar";

/**
 * Classifica a podio: i primi tre in evidenza, gli altri in lista.
 *
 * Nessuna direttiva "use client": è solo markup, quindi la stessa struttura
 * serve sia la pagina della classifica (che non carica JavaScript) sia i
 * riquadri espandibili delle statistiche, che invece sono interattivi.
 */

export interface PodiumRow {
  playerId: string;
  displayName: string;
  /** Il valore già formattato: punti, percentuale, quello che è. */
  label: string;
  rank: number;
  /** Riga secondaria opzionale, sotto il nome. */
  detail?: string;
}

/**
 * Oro, argento, bronzo, e il colore dell'app per tutti gli altri.
 *
 * Il bordo e il numero condividono la tinta: sono due modi di dire la stessa
 * cosa, e vederli separati costringerebbe a ricostruire l'abbinamento ogni
 * volta.
 */
const MEDALS = {
  1: { ring: "ring-amber-400", text: "text-amber-500", size: 88, crown: true },
  2: { ring: "ring-slate-400", text: "text-slate-500", size: 72, crown: false },
  3: { ring: "ring-orange-700", text: "text-orange-700", size: 64, crown: false },
} as const;

function Crown() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mx-auto h-7 w-7 text-amber-400"
      aria-hidden
    >
      <path
        d="M3 8.5l4 3.2L12 4l5 7.7 4-3.2-1.7 9.3H4.7L3 8.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Step({
  row,
  avatarUrl,
  isMe,
}: {
  row: PodiumRow;
  avatarUrl?: string | null;
  isMe: boolean;
}) {
  const medal = MEDALS[Math.min(row.rank, 3) as 1 | 2 | 3];

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      {medal.crown ? <Crown /> : <div className="h-7" aria-hidden />}

      <div className="relative">
        <span className={`block rounded-full ring-4 ${medal.ring}`}>
          <Avatar src={avatarUrl} name={row.displayName} size={medal.size} />
        </span>
        <span
          className={`absolute -bottom-1 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white ${
            row.rank === 1
              ? "bg-amber-400"
              : row.rank === 2
                ? "bg-slate-400"
                : "bg-orange-700"
          }`}
        >
          {row.rank}
        </span>
      </div>

      <p
        className={`mt-3 w-full truncate px-1 text-center text-sm ${
          isMe ? "font-bold" : "font-medium"
        }`}
      >
        {row.displayName}
      </p>
      <p className={`text-lg font-bold tabular-nums ${medal.text}`}>
        {row.label}
      </p>
      {row.detail && (
        <p className="text-[11px] text-slate-500">{row.detail}</p>
      )}
    </div>
  );
}

export function Podium({
  rows,
  me,
  avatarOf,
}: {
  rows: PodiumRow[];
  me: string;
  avatarOf: Map<string, string | null>;
}) {
  // Finché sono tutti allo stesso punto — a inizio campionato, tutti a zero
  // — non c'è nessun podio da mostrare: metterli tutti sul gradino d'oro con
  // la corona direbbe una cosa falsa. Si parte con la sola lista, e il podio
  // compare da solo appena qualcuno stacca gli altri.
  const tuttiPari =
    rows.length > 0 && rows.every((r) => r.rank === rows[0].rank);

  // I primi tre posti, non le prime tre righe: con gli ex aequo il podio può
  // contenerne quattro, e tagliare al terzo elemento ne lascerebbe fuori uno
  // che sta esattamente allo stesso livello.
  const podio = tuttiPari ? [] : rows.filter((r) => r.rank <= 3);
  const resto = tuttiPari ? rows : rows.filter((r) => r.rank > 3);

  // Il primo al centro, come su un podio vero.
  const ordinati = [
    podio.find((r) => r.rank === 2),
    podio.find((r) => r.rank === 1),
    ...podio.filter((r) => r.rank === 3),
    ...podio.filter((r) => r.rank === 2).slice(1),
  ].filter((r): r is PodiumRow => Boolean(r));

  return (
    <div className="flex flex-col gap-4">
      {ordinati.length > 0 && (
        <div className="flex items-end justify-center gap-2 rounded-2xl bg-slate-100 px-2 py-4">
          {ordinati.map((row) => (
            <Step
              key={row.playerId}
              row={row}
              avatarUrl={avatarOf.get(row.playerId)}
              isMe={row.playerId === me}
            />
          ))}
        </div>
      )}

      {resto.length > 0 && (
        <ul className="flex flex-col gap-2">
          {resto.map((row) => (
            <li
              key={row.playerId}
              className={`flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 ${
                row.playerId === me ? "border-slate-900" : "border-slate-200"
              }`}
            >
              <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-slate-400">
                {row.rank}
              </span>
              <span className="block rounded-full ring-2 ring-slate-900">
                <Avatar
                  src={avatarOf.get(row.playerId)}
                  name={row.displayName}
                  size={36}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate ${
                    row.playerId === me ? "font-bold" : "font-medium"
                  }`}
                >
                  {row.displayName}
                </span>
                {row.detail && (
                  <span className="text-xs text-slate-500">{row.detail}</span>
                )}
              </span>
              <span className="shrink-0 text-lg font-bold tabular-nums text-slate-900">
                {row.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
