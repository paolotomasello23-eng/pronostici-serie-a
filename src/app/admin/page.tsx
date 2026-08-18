"use client";

import { useCallback, useEffect, useState } from "react";

type MatchStatus =
  | "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED"
  | "FINISHED" | "POSTPONED" | "SUSPENDED" | "CANCELLED";

interface MatchRow {
  id: string | null;
  external_id: string | null;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: MatchStatus;
  home_goals: number | null;
  away_goals: number | null;
}

interface MatchdayInfo {
  id: string;
  lock_at: string | null;
  status: string;
  source: string;
  last_synced_at: string | null;
}

/** ISO UTC -> valore per <input type="datetime-local"> in ora locale. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRome(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPage() {
  const [season, setSeason] = useState<number | null>(null);
  const [number, setNumber] = useState(1);
  const [matchday, setMatchday] = useState<MatchdayInfo | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/current")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError("Non sei l'amministratore di questa lega.");
          return;
        }
        setSeason(d.season);
        setNumber(d.currentMatchday ?? 1);
      })
      .catch(() => setError("Impossibile contattare il server."));
  }, []);

  const load = useCallback(async () => {
    if (season === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/matchday?season=${season}&number=${number}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Errore");
      setMatchday(d.matchday);
      setMatches(d.matches ?? []);
      setMessage(d.matchday ? null : "Giornata non ancora presente.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [season, number]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sync() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await fetch("/api/admin/matchday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, number }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Errore");
      setMessage(
        `${d.count} partite scaricate: ${d.inserted} nuove, ${d.updated} aggiornate.` +
          (d.lockedAlready ? " Giornata già bloccata: il lock non è stato toccato." : ""),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Scarica i risultati finali dall'API e rifà i conti. */
  async function syncResults() {
    await runScoring("POST", "Risultati scaricati");
  }

  /** Rifà i conti sui dati già presenti, dopo una correzione manuale. */
  async function recompute() {
    await runScoring("PUT", "Punteggi ricalcolati");
  }

  async function runScoring(method: "POST" | "PUT", label: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await fetch("/api/admin/results", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, number }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Errore");
      setMessage(
        `${label}: ${d.finishedMatches} partite finite su ${d.totalMatches}, ` +
          `${d.scoredRows} punteggi scritti.` +
          (d.complete ? " Giornata completa." : " Giornata ancora aperta: mancano dei risultati."),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await fetch("/api/admin/matchday", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season,
          number,
          matches: matches.map((m) => ({
            id: m.id,
            externalId: m.external_id,
            homeTeam: m.home_team,
            awayTeam: m.away_team,
            kickoffAt: m.kickoff_at,
            status: m.status,
            homeGoals: m.status === "FINISHED" ? (m.home_goals ?? 0) : null,
            awayGoals: m.status === "FINISHED" ? (m.away_goals ?? 0) : null,
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Errore");
      setMessage("Salvato.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string | null, index: number) {
    if (!id) {
      setMatches((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/matchday?matchId=${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Errore");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function update(index: number, patch: Partial<MatchRow>) {
    setMatches((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }

  function addEmpty() {
    setMatches((prev) => [
      ...prev,
      {
        id: null,
        external_id: null,
        home_team: "",
        away_team: "",
        kickoff_at: new Date().toISOString(),
        status: "TIMED",
        home_goals: null,
        away_goals: null,
      },
    ]);
  }

  const locked =
    !!matchday?.lock_at && new Date(matchday.lock_at).getTime() <= Date.now();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 p-4 pb-16">
      <header className="pt-4">
        <a href="/" className="text-sm text-slate-500 underline">
          ← Torna alla lega
        </a>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Pannello admin</h1>
        <p className="text-sm text-slate-500">
          Calendario delle giornate: automatico, con correzione a mano sempre
          disponibile.
        </p>
      </header>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}
      {message && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </p>
      )}

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Stagione</span>
          <input
            type="number"
            value={season ?? ""}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="w-28 rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Giornata</span>
          <input
            type="number"
            min={1}
            max={38}
            value={number}
            onChange={(e) => setNumber(Number(e.target.value))}
            className="w-24 rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          onClick={sync}
          disabled={busy || season === null}
          className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          Scarica calendario
        </button>
      </section>

      <section className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="w-full">
          <h2 className="font-semibold">Risultati e punteggi</h2>
          <p className="text-sm text-slate-500">
            Il bonus &quot;unico&quot; dipende dai pronostici di tutti, quindi
            ogni ricalcolo rifà i conti dell&apos;intera giornata.
          </p>
        </div>
        <button
          onClick={syncResults}
          disabled={busy || season === null}
          className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          Scarica risultati e ricalcola
        </button>
        <button
          onClick={recompute}
          disabled={busy || season === null}
          className="rounded-xl border border-slate-300 px-4 py-3 font-semibold disabled:opacity-50"
        >
          Ricalcola e basta
        </button>
      </section>

      {matchday && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>
              Stato: <strong>{matchday.status}</strong>
            </span>
            <span>
              Fonte: <strong>{matchday.source}</strong>
            </span>
            <span>
              Lock:{" "}
              <strong>
                {matchday.lock_at ? formatRome(matchday.lock_at) : "non definito"}
              </strong>
            </span>
          </div>
          {locked && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              Giornata bloccata: i pronostici non sono più modificabili e il lock
              non verrà ricalcolato, nemmeno se cambiano gli orari.
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Partite ({matches.length})</h2>
          <button onClick={addEmpty} className="text-sm text-slate-600 underline">
            + Aggiungi partita
          </button>
        </div>

        {matches.map((m, i) => (
          <div
            key={m.id ?? `nuova-${i}`}
            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3"
          >
            <div className="flex items-center gap-2">
              <input
                value={m.home_team}
                onChange={(e) => update(i, { home_team: e.target.value })}
                placeholder="Casa"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
              />
              <span className="text-slate-400">–</span>
              <input
                value={m.away_team}
                onChange={(e) => update(i, { away_team: e.target.value })}
                placeholder="Trasferta"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={toLocalInput(m.kickoff_at)}
                onChange={(e) =>
                  update(i, {
                    kickoff_at: new Date(e.target.value).toISOString(),
                  })
                }
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
              <select
                value={m.status}
                onChange={(e) =>
                  update(i, { status: e.target.value as MatchStatus })
                }
                className="rounded-lg border border-slate-300 px-3 py-2"
              >
                {["TIMED", "SCHEDULED", "IN_PLAY", "PAUSED", "FINISHED", "POSTPONED", "SUSPENDED", "CANCELLED"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ),
                )}
              </select>

              {m.status === "FINISHED" && (
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={m.home_goals ?? 0}
                    onChange={(e) => update(i, { home_goals: Number(e.target.value) })}
                    className="w-16 rounded-lg border border-slate-300 px-2 py-2 text-center"
                  />
                  <span>–</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={m.away_goals ?? 0}
                    onChange={(e) => update(i, { away_goals: Number(e.target.value) })}
                    className="w-16 rounded-lg border border-slate-300 px-2 py-2 text-center"
                  />
                </span>
              )}

              <button
                onClick={() => remove(m.id, i)}
                className="ml-auto text-sm text-red-700 underline"
              >
                Elimina
              </button>
            </div>
          </div>
        ))}

        {matches.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
            Nessuna partita. Scaricala dall&apos;API o aggiungila a mano.
          </p>
        )}
      </section>

      <button
        onClick={save}
        disabled={busy || matches.length === 0}
        className="sticky bottom-4 rounded-xl bg-slate-900 px-5 py-4 text-lg font-semibold text-white shadow-lg disabled:opacity-50"
      >
        {busy ? "Un attimo…" : "Salva le partite"}
      </button>
    </main>
  );
}
