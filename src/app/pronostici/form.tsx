"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TeamCrest } from "@/components/team-crest";
import { Countdown } from "@/components/countdown";

interface Match {
  id: string;
  home_team_short: string | null;
  away_team_short: string | null;
  home_team: string;
  away_team: string;
  home_team_crest: string | null;
  away_team_crest: string | null;
  kickoff_at: string;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
}

interface Prediction {
  match_id: string;
  player_id: string;
  home_goals: number;
  away_goals: number;
  outcome: string;
}

interface Payload {
  matchday: { id: string; number: number; lock_at: string | null; status: string };
  isLocked: boolean;
  matches: Match[];
  predictions: Prediction[];
  names: Record<string, string>;
  me: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** Valori digitati: stringhe, perché "" è diverso da 0. */
type Draft = Record<string, { home: string; away: string }>;

function formatRome(iso: string, withWeekday = true): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    ...(withWeekday ? { weekday: "short" } : {}),
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function teamName(m: Match, side: "home" | "away"): string {
  return side === "home"
    ? (m.home_team_short ?? m.home_team)
    : (m.away_team_short ?? m.away_team);
}

export function PronosticiForm({ matchdayId }: { matchdayId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/predictions?matchdayId=${matchdayId}`);
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Errore di caricamento.");
      return;
    }
    setData(d);
    const mine: Draft = {};
    for (const p of d.predictions as Prediction[]) {
      if (p.player_id === d.me) {
        mine[p.match_id] = { home: String(p.home_goals), away: String(p.away_goals) };
      }
    }
    setDraft(mine);
  }, [matchdayId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (current: Draft) => {
      // Solo i pronostici completi: se hai scritto il gol di casa e stai
      // ancora pensando all'altro, non c'è niente da salvare.
      const ready = Object.entries(current)
        .filter(([, v]) => v.home !== "" && v.away !== "")
        .map(([matchId, v]) => ({
          matchId,
          homeGoals: Number(v.home),
          awayGoals: Number(v.away),
        }));

      if (ready.length === 0) return;

      setSaveState("saving");
      setError(null);
      try {
        const r = await fetch("/api/predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ predictions: ready }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Salvataggio fallito.");
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
        setError((e as Error).message);
      }
    },
    [],
  );

  function update(matchId: string, side: "home" | "away", value: string) {
    const clean = value.replace(/\D/g, "").slice(0, 2);
    setDraft((prev) => {
      const current = prev[matchId] ?? { home: "", away: "" };
      const next = {
        ...prev,
        [matchId]: { ...current, [side]: clean },
      };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(next), 800);
      return next;
    });
  }

  if (error && !data) {
    return (
      <main className="mx-auto max-w-md p-6">
        <a href="/" className="text-sm text-slate-500 underline">← Torna alla lega</a>
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-red-800">{error}</p>
      </main>
    );
  }

  if (!data) {
    return <main className="p-6 text-slate-500">Caricamento…</main>;
  }

  const compiled = Object.values(draft).filter(
    (v) => v.home !== "" && v.away !== "",
  ).length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-28">
      <header className="pt-4">
        <a href="/" className="text-sm text-slate-500 underline">← Torna alla lega</a>
        <div className="mt-2 flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">
            Giornata {data.matchday.number}
          </h1>
          <span
            className={`text-sm font-medium ${data.isLocked ? "text-amber-700" : "text-emerald-700"}`}
          >
            {data.isLocked ? "Bloccata" : "Aperta"}
          </span>
        </div>
        {data.matchday.lock_at && (
          <p className="mt-1 text-sm text-slate-500">
            {data.isLocked ? "Bloccata dal" : "Si blocca il"}{" "}
            {formatRome(data.matchday.lock_at)}
          </p>
        )}
      </header>

      {data.matchday.lock_at && !data.isLocked && (
        <Countdown
          lockAt={data.matchday.lock_at}
          compiled={compiled}
          total={data.matches.length}
        />
      )}

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {data.isLocked ? (
        <LockedView data={data} />
      ) : (
        <>
          <p className="text-sm text-slate-500">
            Scrivi il risultato esatto. Si salva da solo, e puoi cambiarlo fino
            al calcio d&apos;inizio della prima partita.
          </p>

          <ul className="flex flex-col gap-2">
            {data.matches.map((m) => {
              const value = draft[m.id] ?? { home: "", away: "" };
              const done = value.home !== "" && value.away !== "";
              return (
                <li
                  key={m.id}
                  className={`rounded-2xl border bg-white px-3 py-3 ${done ? "border-slate-200" : "border-slate-300 bg-slate-50"}`}
                >
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{formatRome(m.kickoff_at)}</span>
                    {["POSTPONED", "SUSPENDED", "CANCELLED"].includes(m.status) && (
                      <span className="font-medium text-amber-700">
                        {m.status === "POSTPONED" ? "Rinviata" : m.status === "SUSPENDED" ? "Sospesa" : "Annullata"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                      <span className="truncate font-medium">
                        {teamName(m, "home")}
                      </span>
                      <TeamCrest
                        src={m.home_team_crest}
                        name={teamName(m, "home")}
                        size={20}
                      />
                    </span>
                    <input
                      inputMode="numeric"
                      value={value.home}
                      onChange={(e) => update(m.id, "home", e.target.value)}
                      className="w-12 shrink-0 rounded-lg border border-slate-300 py-3 text-center text-lg font-semibold"
                      aria-label={`Gol ${teamName(m, "home")}`}
                    />
                    <span className="shrink-0 text-slate-400">–</span>
                    <input
                      inputMode="numeric"
                      value={value.away}
                      onChange={(e) => update(m.id, "away", e.target.value)}
                      className="w-12 shrink-0 rounded-lg border border-slate-300 py-3 text-center text-lg font-semibold"
                      aria-label={`Gol ${teamName(m, "away")}`}
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <TeamCrest
                        src={m.away_team_crest}
                        name={teamName(m, "away")}
                        size={20}
                      />
                      <span className="truncate font-medium">
                        {teamName(m, "away")}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Sopra la barra di navigazione, che occupa gli ultimi 80px. */}
          <div className="fixed inset-x-0 bottom-20 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
            <div className="mx-auto flex max-w-md items-center justify-between">
              <span className="text-sm text-slate-600">
                {compiled} di {data.matches.length} compilati
              </span>
              <span className="text-sm font-medium">
                {saveState === "saving" && <span className="text-slate-500">Salvo…</span>}
                {saveState === "saved" && <span className="text-emerald-700">Salvato</span>}
                {saveState === "error" && <span className="text-red-700">Non salvato</span>}
              </span>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

/** A giornata bloccata i pronostici di tutti diventano pubblici. */
function LockedView({ data }: { data: Payload }) {
  return (
    <>
      <p className="text-sm text-slate-500">
        La giornata è iniziata: i pronostici di tutti sono ora visibili.
      </p>
      <ul className="flex flex-col gap-3">
        {data.matches.map((m) => {
          const rows = data.predictions.filter((p) => p.match_id === m.id);
          return (
            <li key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                  <TeamCrest
                    src={m.home_team_crest}
                    name={teamName(m, "home")}
                    size={22}
                  />
                  <span className="truncate">{teamName(m, "home")}</span>
                  <span className="text-slate-400">–</span>
                  <TeamCrest
                    src={m.away_team_crest}
                    name={teamName(m, "away")}
                    size={22}
                  />
                  <span className="truncate">{teamName(m, "away")}</span>
                </span>
                {m.status === "FINISHED" ? (
                  <span className="shrink-0 text-lg font-bold tabular-nums">
                    {m.home_goals}-{m.away_goals}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatRome(m.kickoff_at, false)}
                  </span>
                )}
              </div>

              <ul className="mt-3 flex flex-col gap-1">
                {rows.length === 0 && (
                  <li className="text-sm text-slate-400">Nessun pronostico.</li>
                )}
                {rows.map((p) => (
                  <li
                    key={p.player_id}
                    className={`flex items-center justify-between text-sm ${p.player_id === data.me ? "font-semibold" : ""}`}
                  >
                    <span>{data.names[p.player_id] ?? "—"}</span>
                    <span className="tabular-nums">
                      {p.home_goals}-{p.away_goals}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </>
  );
}
