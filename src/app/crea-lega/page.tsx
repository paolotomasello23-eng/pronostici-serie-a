"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Creazione della lega: funziona una volta sola, e chi la usa diventa admin.
 * Da fare in locale prima di mettere l'app online.
 */
export default function CreaLegaPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const [leagueName, setLeagueName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");

  useEffect(() => {
    fetch("/api/leagues")
      .then((r) => r.json())
      .then((data) => setAlreadyExists(data.exists === true))
      .catch(() => setAlreadyExists(false))
      .finally(() => setChecking(false));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueName,
          season: new Date().getFullYear(),
          displayName,
          pin,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Errore.");
      setInviteCode(data.inviteCode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return <main className="p-6 text-slate-500">Un attimo…</main>;
  }

  if (inviteCode) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
        <h1 className="text-2xl font-bold">Lega creata</h1>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Codice d&apos;invito
          </p>
          <p className="mt-2 text-4xl font-bold tracking-[0.3em]">{inviteCode}</p>
        </div>
        <p className="text-slate-600">
          Manda questo codice ai tuoi amici: gli serve per entrare. Lo ritrovi
          sempre nella schermata principale.
        </p>
        <button
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
          className="rounded-xl bg-slate-900 px-5 py-4 text-lg font-semibold text-white"
        >
          Vai alla lega
        </button>
      </main>
    );
  }

  if (alreadyExists) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold">Lega già creata</h1>
        <p className="text-slate-600">
          Ne esiste già una: per entrare ti serve il codice d&apos;invito.
        </p>
        <a
          href="/entra"
          className="rounded-xl bg-slate-900 px-5 py-4 text-center text-lg font-semibold text-white"
        >
          Vai al login
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <header className="pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Crea la lega</h1>
        <p className="mt-1 text-slate-600">
          Diventi l&apos;amministratore. Si può fare una volta sola.
        </p>
      </header>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="font-medium">Nome della lega</span>
          <input
            value={leagueName}
            onChange={(e) => setLeagueName(e.target.value)}
            maxLength={60}
            placeholder="Es. Fantacalcio del bar"
            className="rounded-xl border border-slate-300 px-4 py-4 text-lg"
            required
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-medium">Il tuo nome</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={20}
            autoComplete="off"
            className="rounded-xl border border-slate-300 px-4 py-4 text-lg"
            required
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-medium">Il tuo PIN di 6 cifre</span>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="······"
            className="rounded-xl border border-slate-300 px-4 py-4 text-center text-2xl tracking-[0.5em]"
            required
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-slate-900 px-5 py-4 text-lg font-semibold text-white active:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Un attimo…" : "Crea la lega"}
        </button>
      </form>
    </main>
  );
}
