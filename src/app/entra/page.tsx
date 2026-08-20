"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * La prima schermata.
 *
 * Tre strade, chieste una alla volta: entrare in una lega che esiste,
 * crearne una, o rientrare con un account che si ha già. Le credenziali
 * arrivano per ultime, quando si è già scelto dove si va a finire: chiedere
 * un nome utente prima di aver detto a cosa serve è il modo più rapido per
 * far chiudere la pagina.
 */
type Passo = "scelta" | "codice" | "nomeLega" | "credenziali" | "login";
type Strada = "join" | "create";

export default function EntraPage() {
  const router = useRouter();
  const [passo, setPasso] = useState<Passo>("scelta");
  const [strada, setStrada] = useState<Strada>("join");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inviteCode, setInviteCode] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [codiceCreato, setCodiceCreato] = useState<string | null>(null);

  function indietro() {
    setError(null);
    if (passo === "credenziali") setPasso(strada === "join" ? "codice" : "nomeLega");
    else setPasso("scelta");
  }

  async function registra(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (pin !== pinConfirm) {
      setError("I due PIN non coincidono.");
      return;
    }

    setBusy(true);
    try {
      const body =
        strada === "create"
          ? { mode: "create", leagueName, username, pin }
          : { inviteCode, username, pin };

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Iscrizione non riuscita.");

      // Chi ha appena creato la lega deve vedere il codice da mandare agli
      // amici: portarlo dentro senza mostrarglielo lo costringerebbe a
      // cercarlo subito dopo.
      if (data.inviteCode) {
        setCodiceCreato(data.inviteCode);
        return;
      }

      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setPin("");
      setPinConfirm("");
    } finally {
      setBusy(false);
    }
  }

  async function accedi(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pin }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Accesso non riuscito.");
      router.push(data.goToLeagues ? "/leghe" : "/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  if (codiceCreato) {
    return (
      <Schermo>
        <h1 className="text-2xl font-bold tracking-tight">Lega creata</h1>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm font-medium text-slate-500">
            Codice d&apos;invito
          </p>
          <p className="mt-2 text-4xl font-bold tracking-[0.3em]">
            {codiceCreato}
          </p>
        </div>
        <p className="text-slate-600">
          Mandalo ai tuoi amici: gli serve per entrare. Lo ritrovi sempre nella
          schermata delle tue leghe.
        </p>
        <Bottone
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
        >
          Entra nella lega
        </Bottone>
      </Schermo>
    );
  }

  return (
    <Schermo>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Pronostici Serie A</h1>
        <p className="mt-1 text-slate-600">
          {passo === "scelta" && "Pronostici di Serie A tra amici."}
          {passo === "codice" && "Inserisci il codice che ti hanno mandato."}
          {passo === "nomeLega" && "Come si chiama la tua lega?"}
          {passo === "credenziali" && "Scegli come ti chiamerai."}
          {passo === "login" && "Entra con il tuo nome utente."}
        </p>
      </header>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {passo === "scelta" && (
        <div className="flex flex-col gap-3">
          <Bottone
            onClick={() => {
              setStrada("join");
              setPasso("codice");
            }}
          >
            Entra in una lega
          </Bottone>
          <button
            onClick={() => {
              setStrada("create");
              setPasso("nomeLega");
            }}
            className="rounded-xl border-2 border-slate-300 px-5 py-4 text-lg font-semibold text-slate-700 active:bg-slate-100"
          >
            Crea una lega
          </button>
          <button
            onClick={() => setPasso("login")}
            className="mt-2 text-sm text-slate-600 underline"
          >
            Ho già un account
          </button>
        </div>
      )}

      {passo === "codice" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPasso("credenziali");
          }}
          className="flex flex-col gap-4"
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
          <Bottone>Continua</Bottone>
          <Indietro onClick={indietro} />
        </form>
      )}

      {passo === "nomeLega" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPasso("credenziali");
          }}
          className="flex flex-col gap-4"
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
            Diventi l&apos;amministratore. Alla fine ricevi un codice da
            mandare agli amici.
          </p>
          <Bottone>Continua</Bottone>
          <Indietro onClick={indietro} />
        </form>
      )}

      {passo === "credenziali" && (
        <form onSubmit={registra} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="font-medium">Nome utente</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
              maxLength={20}
              autoCapitalize="none"
              autoComplete="username"
              autoFocus
              placeholder="Come ti chiami nel gruppo"
              className="rounded-xl border border-slate-300 px-4 py-4 text-lg"
              required
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-medium">Scegli un PIN di 6 cifre</span>
            <PinInput value={pin} onChange={setPin} />
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-medium">Ripeti il PIN</span>
            <PinInput value={pinConfirm} onChange={setPinConfirm} />
          </label>

          <p className="text-sm text-slate-500">
            Il PIN ti servirà per rientrare. Segnatelo da qualche parte.
          </p>

          <Bottone busy={busy}>
            {strada === "create" ? "Crea la lega" : "Entra nella lega"}
          </Bottone>
          <Indietro onClick={indietro} />
        </form>
      )}

      {passo === "login" && (
        <form onSubmit={accedi} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="font-medium">Nome utente</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
              maxLength={20}
              autoCapitalize="none"
              autoComplete="username"
              autoFocus
              className="rounded-xl border border-slate-300 px-4 py-4 text-lg"
              required
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-medium">PIN</span>
            <PinInput value={pin} onChange={setPin} />
          </label>
          <Bottone busy={busy}>Entra</Bottone>
          <Indietro onClick={indietro} />
        </form>
      )}
    </Schermo>
  );
}

function Schermo({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      {children}
    </main>
  );
}

function Bottone({
  children,
  busy,
  onClick,
}: {
  children: React.ReactNode;
  busy?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={busy}
      className="rounded-xl bg-slate-900 px-5 py-4 text-lg font-semibold text-white active:bg-slate-700 disabled:opacity-50"
    >
      {busy ? "Un attimo…" : children}
    </button>
  );
}

function Indietro({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start text-sm text-slate-500 underline"
    >
      Indietro
    </button>
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
