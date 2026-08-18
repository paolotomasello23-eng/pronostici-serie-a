"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "code" | "who" | "pin" | "new";

export default function EntraPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("code");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inviteCode, setInviteCode] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [isFull, setIsFull] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");

  async function post(url: string, body: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Qualcosa è andato storto.");
    return data;
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await post("/api/auth/lookup", { inviteCode });
      setLeagueName(data.leagueName);
      setMembers(data.members);
      setIsFull(data.isFull);
      setStep("who");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/login", { inviteCode, displayName, pin });
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister(event: React.FormEvent) {
    event.preventDefault();
    if (pin !== pinConfirm) {
      setError("I due PIN non coincidono.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/register", { inviteCode, displayName, pin });
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <header className="pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Pronostici Serie A</h1>
        {leagueName && step !== "code" && (
          <p className="mt-1 text-slate-600">
            Lega <span className="font-semibold">{leagueName}</span>
          </p>
        )}
      </header>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {step === "code" && (
        <form onSubmit={submitCode} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="font-medium">Codice della lega</span>
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABC123"
              className="rounded-xl border border-slate-300 px-4 py-4 text-center text-2xl font-semibold tracking-[0.3em] uppercase"
              required
            />
          </label>
          <Button busy={busy}>Continua</Button>
        </form>
      )}

      {step === "who" && (
        <div className="flex flex-col gap-3">
          <p className="font-medium">Chi sei?</p>
          {members.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setDisplayName(name);
                setPin("");
                setStep("pin");
              }}
              className="rounded-2xl border border-slate-300 bg-white px-5 py-4 text-left text-lg font-medium active:bg-slate-100"
            >
              {name}
            </button>
          ))}

          {!isFull && (
            <button
              type="button"
              onClick={() => {
                setDisplayName("");
                setPin("");
                setPinConfirm("");
                setStep("new");
              }}
              className="rounded-2xl border-2 border-dashed border-slate-300 px-5 py-4 text-left text-lg font-medium text-slate-600 active:bg-slate-100"
            >
              + Sono nuovo
            </button>
          )}
          {isFull && members.length > 0 && (
            <p className="text-sm text-slate-500">
              La lega è al completo: 10 giocatori.
            </p>
          )}

          <button
            type="button"
            onClick={() => setStep("code")}
            className="mt-2 self-start text-sm text-slate-500 underline"
          >
            Cambia codice
          </button>
        </div>
      )}

      {step === "pin" && (
        <form onSubmit={submitLogin} className="flex flex-col gap-4">
          <p className="text-lg">
            Ciao <span className="font-semibold">{displayName}</span>, inserisci il
            tuo PIN.
          </p>
          <PinInput value={pin} onChange={setPin} autoFocus />
          <Button busy={busy}>Entra</Button>
          <button
            type="button"
            onClick={() => setStep("who")}
            className="self-start text-sm text-slate-500 underline"
          >
            Non sono io
          </button>
        </form>
      )}

      {step === "new" && (
        <form onSubmit={submitRegister} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="font-medium">Come ti chiami?</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={20}
              autoComplete="off"
              placeholder="Il tuo nome nel gruppo"
              className="rounded-xl border border-slate-300 px-4 py-4 text-lg"
              required
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="font-medium">Scegli un PIN di 6 cifre</span>
            <PinInput value={pin} onChange={setPin} />
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-medium">Ripetilo</span>
            <PinInput value={pinConfirm} onChange={setPinConfirm} />
          </div>

          <p className="text-sm text-slate-500">
            Ti servirà per rientrare. Segnatelo da qualche parte.
          </p>

          <Button busy={busy}>Entra nella lega</Button>
          <button
            type="button"
            onClick={() => setStep("who")}
            className="self-start text-sm text-slate-500 underline"
          >
            Indietro
          </button>
        </form>
      )}
    </main>
  );
}

function PinInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="password"
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="······"
      className="rounded-xl border border-slate-300 px-4 py-4 text-center text-2xl tracking-[0.5em]"
      required
    />
  );
}

function Button({
  children,
  busy,
}: {
  children: React.ReactNode;
  busy: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded-xl bg-slate-900 px-5 py-4 text-lg font-semibold text-white active:bg-slate-700 disabled:opacity-50"
    >
      {busy ? "Un attimo…" : children}
    </button>
  );
}
