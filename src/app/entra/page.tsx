"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Accesso.
 *
 * Due strade: chi ha già un account entra con nome utente e PIN, chi arriva
 * per la prima volta ha bisogno anche del codice della lega che lo invita.
 * Il codice serve una volta sola, all'inizio: non è una password, è un
 * invito.
 */
type Mode = "login" | "register";

export default function EntraPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (mode === "register" && pin !== pinConfirm) {
      setError("I due PIN non coincidono.");
      return;
    }

    setBusy(true);
    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login" ? { username, pin } : { inviteCode, username, pin };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Accesso non riuscito.");

      router.push(data.goToLeagues ? "/leghe" : "/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setPin("");
      setPinConfirm("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Pronostici Serie A</h1>
        <p className="mt-1 text-slate-600">
          {mode === "login"
            ? "Entra con il tuo nome utente."
            : "Crea il tuo account con il codice che ti hanno mandato."}
        </p>
      </header>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        {mode === "register" && (
          <label className="flex flex-col gap-2">
            <span className="font-medium">Codice della lega</span>
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABC123"
              className="rounded-xl border border-slate-300 px-4 py-4 text-center text-2xl font-semibold uppercase tracking-[0.3em]"
              required
            />
          </label>
        )}

        <label className="flex flex-col gap-2">
          <span className="font-medium">Nome utente</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
            maxLength={20}
            autoCapitalize="none"
            autoComplete="username"
            placeholder="Come ti chiami nel gruppo"
            className="rounded-xl border border-slate-300 px-4 py-4 text-lg"
            required
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-medium">
            {mode === "login" ? "PIN" : "Scegli un PIN di 6 cifre"}
          </span>
          <PinInput value={pin} onChange={setPin} />
        </label>

        {mode === "register" && (
          <label className="flex flex-col gap-2">
            <span className="font-medium">Ripeti il PIN</span>
            <PinInput value={pinConfirm} onChange={setPinConfirm} />
          </label>
        )}

        {mode === "register" && (
          <p className="text-sm text-slate-500">
            Il PIN ti servirà per rientrare. Segnatelo da qualche parte.
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-slate-900 px-5 py-4 text-lg font-semibold text-white active:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Un attimo…" : mode === "login" ? "Entra" : "Crea account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
          setPin("");
          setPinConfirm("");
        }}
        className="text-sm text-slate-600 underline"
      >
        {mode === "login"
          ? "È la prima volta che entro"
          : "Ho già un account"}
      </button>
    </main>
  );
}

function PinInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="password"
      inputMode="numeric"
      autoComplete="one-time-code"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="······"
      className="rounded-xl border border-slate-300 px-4 py-4 text-center text-2xl tracking-[0.5em]"
      required
    />
  );
}
