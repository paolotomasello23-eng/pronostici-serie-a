"use client";

import { useEffect, useState } from "react";

/**
 * Quanto manca al blocco dei pronostici.
 *
 * Il conto alla rovescia parte solo dopo che la pagina si è aperta nel
 * browser: server e telefono non hanno lo stesso orologio al millisecondo, e
 * far calcolare al server un valore che cambia ogni secondo produrrebbe una
 * discrepanza al primo caricamento. Meglio un trattino per un istante che un
 * numero sbagliato.
 */
function split(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    giorni: Math.floor(total / 86400),
    ore: Math.floor((total % 86400) / 3600),
    minuti: Math.floor((total % 3600) / 60),
    secondi: total % 60,
  };
}

export function Countdown({
  lockAt,
  compiled,
  total,
}: {
  lockAt: string;
  /** Quante partite hai già compilato: serve a distinguere l'urgenza. */
  compiled?: number;
  total?: number;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(lockAt).getTime();
    const tick = () => setRemaining(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockAt]);

  if (remaining === null) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        Calcolo il tempo rimasto…
      </div>
    );
  }

  if (remaining <= 0) {
    return (
      <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
        <p className="font-semibold">Pronostici chiusi</p>
        <p className="text-sm text-slate-300">La giornata è iniziata.</p>
      </div>
    );
  }

  const { giorni, ore, minuti, secondi } = split(remaining);
  const hours = remaining / 3_600_000;

  // Tre livelli: c'è tempo, comincia a stringere, ultimissime ore.
  const urgent = hours < 3;
  const soon = hours < 24;

  const incomplete =
    compiled !== undefined && total !== undefined && compiled < total;

  const tone = urgent
    ? "border-red-300 bg-red-50 text-red-900"
    : soon
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`rounded-2xl border px-4 py-3 ${tone}`}>
      <p className="text-sm font-medium opacity-80">
        {urgent ? "Ultime ore per pronosticare" : "Tempo rimasto"}
      </p>

      <p className="mt-1 flex items-baseline gap-1 text-2xl font-bold tabular-nums">
        {giorni > 0 && (
          <>
            <span>{giorni}</span>
            <span className="text-base font-medium opacity-70">g</span>
          </>
        )}
        <span>{String(ore).padStart(2, "0")}</span>
        <span className="text-base font-medium opacity-70">h</span>
        <span>{String(minuti).padStart(2, "0")}</span>
        <span className="text-base font-medium opacity-70">m</span>
        {giorni === 0 && (
          <>
            <span>{String(secondi).padStart(2, "0")}</span>
            <span className="text-base font-medium opacity-70">s</span>
          </>
        )}
      </p>

      {incomplete && (
        <p className="mt-1 text-sm font-medium">
          Ti mancano {total! - compiled!} partite su {total}.
        </p>
      )}
      {!incomplete && compiled !== undefined && (
        <p className="mt-1 text-sm opacity-80">
          Hai compilato tutte le partite. Puoi ancora cambiare idea.
        </p>
      )}
    </div>
  );
}
