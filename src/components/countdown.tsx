"use client";

import { useEffect, useState } from "react";

/**
 * Quanto manca al blocco dei pronostici.
 *
 * Il conto alla rovescia parte solo dopo che la pagina si è aperta nel
 * browser: server e telefono non hanno lo stesso orologio al millisecondo, e
 * far calcolare al server un valore che cambia ogni secondo produrrebbe una
 * discrepanza al primo caricamento.
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
    return <div className="h-[52px]" aria-hidden />;
  }

  if (remaining <= 0) {
    return (
      <p className="text-center text-lg font-bold text-slate-500">
        Pronostici chiusi
      </p>
    );
  }

  const { giorni, ore, minuti, secondi } = split(remaining);
  const hours = remaining / 3_600_000;

  // Verde finché c'è tempo, giallo nell'ultimo giorno, rosso nelle ultime ore.
  const color =
    hours < 2
      ? "text-red-600"
      : hours < 24
        ? "text-amber-500"
        : "text-emerald-600";

  return (
    <div className="text-center">
      <p className={`text-3xl font-bold tabular-nums ${color}`}>
        {giorni > 0 ? (
          <>
            {giorni}
            <Unit>g</Unit>
            {String(ore).padStart(2, "0")}
            <Unit>h</Unit>
            {String(minuti).padStart(2, "0")}
            <Unit>m</Unit>
          </>
        ) : (
          <>
            {String(ore).padStart(2, "0")}
            <Unit>h</Unit>
            {String(minuti).padStart(2, "0")}
            <Unit>m</Unit>
            {String(secondi).padStart(2, "0")}
            <Unit>s</Unit>
          </>
        )}
      </p>

      {compiled !== undefined && total !== undefined && (
        <p className="mt-1 text-sm text-slate-500">
          Partite compilate: {compiled}/{total}
        </p>
      )}
    </div>
  );
}

function Unit({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 text-lg font-semibold opacity-60">{children}</span>
  );
}
