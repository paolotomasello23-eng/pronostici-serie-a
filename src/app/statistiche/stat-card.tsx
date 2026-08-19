"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Podium, type PodiumRow } from "@/components/podium";
import type { StatLeaderboard } from "@/lib/scoring/stats";

/**
 * Riquadro di una statistica: il podio in miniatura, e la classifica intera
 * quando lo si tocca.
 *
 * A schermo intero e non in una finestrella: su un telefono una classifica
 * da dieci persone dentro un riquadro piccolo si legge male, e l'apertura
 * completa toglie di mezzo tutto il resto invece di comprimerlo.
 */
export function StatCard({
  stat,
  me,
  avatarOf,
}: {
  stat: StatLeaderboard;
  me: string;
  avatarOf: Map<string, string | null>;
}) {
  const [open, setOpen] = useState(false);

  // Con la classifica aperta la pagina sotto non deve scorrere.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const rows: PodiumRow[] = stat.entries.map((e) => ({
    playerId: e.playerId,
    displayName: e.displayName,
    label: e.label,
    rank: e.rank,
  }));

  const primi = stat.entries.filter((e) => e.rank <= 3).slice(0, 3);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="w-full rounded-2xl bg-slate-900 p-4 text-left text-white active:bg-slate-800"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">{stat.title}</span>
          <span aria-hidden className="shrink-0 text-sm text-slate-400">
            vedi tutti ›
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-400">{stat.description}</p>

        <div className="mt-3 flex gap-2">
          {primi.map((entry) => (
            <div
              key={entry.playerId}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl bg-slate-800 px-2 py-2.5"
            >
              <span
                className={`block rounded-full ring-2 ${
                  entry.rank === 1
                    ? "ring-amber-400"
                    : entry.rank === 2
                      ? "ring-slate-400"
                      : "ring-orange-700"
                }`}
              >
                <Avatar
                  src={avatarOf.get(entry.playerId)}
                  name={entry.displayName}
                  size={34}
                />
              </span>
              <span className="w-full truncate text-center text-[11px] text-slate-300">
                {entry.displayName}
              </span>
              <span
                className={`text-sm font-bold tabular-nums ${
                  entry.rank === 1
                    ? "text-amber-400"
                    : entry.rank === 2
                      ? "text-slate-300"
                      : "text-orange-500"
                }`}
              >
                {entry.label}
              </span>
            </div>
          ))}
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{stat.title}</h2>
              <p className="truncate text-xs text-slate-500">
                {stat.description}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Chiudi"
              className="shrink-0 rounded-lg px-3 py-1 text-2xl leading-none text-slate-400 active:bg-slate-100"
            >
              ×
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 pb-10">
            <Podium rows={rows} me={me} avatarOf={avatarOf} />
          </div>
        </div>
      )}
    </>
  );
}
