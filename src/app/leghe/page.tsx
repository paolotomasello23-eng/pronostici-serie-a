"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface League {
  id: string;
  name: string;
  season: number;
  displayName: string;
  isAdmin: boolean;
  players: number;
}

/**
 * Le mie leghe.
 *
 * La schermata da cui si sceglie dove giocare, e da cui si entra in una
 * lega nuova con il suo codice. Chi ne ha una sola non la vede quasi mai:
 * il login lo porta dritto dentro.
 */
export default function LeghePage() {
  const router = useRouter();
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/leagues/mine");
    if (response.status === 401) {
      router.push("/entra");
      return;
    }
    const data = await response.json();
    setLeagues(data.leagues ?? []);
    setActiveId(data.activeLeagueId ?? null);
    setUsername(data.username ?? "");
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(leagueId: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/leagues/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Non riesco ad aprirla.");
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/leagues/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Ingresso non riuscito.");
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function crea(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/leagues/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: leagueName }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Creazione non riuscita.");
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-5">
      <header className="pt-4">
        <p className="text-base font-medium text-slate-500">{username}</p>
        <h1 className="mt-0.5 text-3xl font-bold tracking-tight">Le mie leghe</h1>
      </header>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {leagues === null ? (
        <p className="text-slate-500">Caricamento…</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {leagues.map((league) => (
            <li key={league.id}>
              <button
                onClick={() => open(league.id)}
                disabled={busy}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-4 text-left disabled:opacity-50 ${
                  league.id === activeId
                    ? "border-slate-900"
                    : "border-slate-200"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold">
                    {league.name}
                  </span>
                  <span className="block text-sm text-slate-500">
                    {league.players} giocator{league.players === 1 ? "e" : "i"}
                    {league.isAdmin && (
                      <span className="text-amber-600"> · sei l&apos;admin</span>
                    )}
                  </span>
                </span>
                <span aria-hidden className="shrink-0 text-2xl text-slate-300">
                  ›
                </span>
              </button>
            </li>
          ))}

          {leagues.length === 0 && (
            <li className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
              Non sei ancora in nessuna lega. Serve un codice d&apos;invito.
            </li>
          )}
        </ul>
      )}

      {adding ? (
        <form
          onSubmit={join}
          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <label className="flex flex-col gap-2">
            <span className="font-medium">Codice della lega</span>
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
              placeholder="ABC123"
              className="rounded-xl border border-slate-300 px-4 py-4 text-center text-2xl font-semibold uppercase tracking-[0.3em]"
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-slate-900 px-5 py-4 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Un attimo…" : "Entra nella lega"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
            className="text-sm text-slate-500 underline"
          >
            Annulla
          </button>
        </form>
      ) : creating ? (
        <form
          onSubmit={crea}
          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <label className="flex flex-col gap-2">
            <span className="font-medium">Nome della lega</span>
            <input
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              maxLength={60}
              minLength={2}
              autoFocus
              placeholder="Es. Fantacalcio del bar"
              className="rounded-xl border border-slate-300 px-4 py-4 text-lg"
              required
            />
          </label>
          <p className="text-sm text-slate-500">
            Ne diventi l&apos;amministratore e ricevi un codice da mandare agli
            amici.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-slate-900 px-5 py-4 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Un attimo…" : "Crea la lega"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setError(null);
            }}
            className="text-sm text-slate-500 underline"
          >
            Annulla
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setAdding(true)}
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-5 py-4 font-semibold text-slate-600 active:bg-slate-100"
          >
            <span className="text-2xl leading-none">+</span>
            Entra in una nuova lega
          </button>
          <button
            onClick={() => setCreating(true)}
            className="rounded-2xl border-2 border-dashed border-slate-300 px-5 py-4 font-semibold text-slate-600 active:bg-slate-100"
          >
            Crea una nuova lega
          </button>
        </div>
      )}

      <a href="/esci" className="mt-2 text-center text-sm text-slate-500 underline">
        Esci
      </a>
    </main>
  );
}
