"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Attiva o disattiva le notifiche su questo dispositivo.
 *
 * "Questo dispositivo" è la parte importante: il permesso lo dà il browser,
 * non l'account. Chi usa telefono e computer deve attivarle su entrambi, ed
 * è il motivo per cui il pulsante dice sempre cosa vale dove.
 */

type State =
  | "checking"
  | "unsupported"
  | "denied"
  | "off"
  | "on";

/**
 * La chiave VAPID viaggia in base64url e va convertita in byte.
 *
 * Il buffer va allocato esplicitamente: `Uint8Array.from` produce un tipo
 * che l'API delle notifiche non accetta, perché potrebbe appoggiarsi a
 * memoria condivisa.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);

  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Campanella attiva: sveglia, con le onde del suono.
 * Campanella spenta: la stessa, sbarrata.
 *
 * Due disegni vicini e non due simboli diversi: si deve capire a colpo
 * d'occhio che è la stessa cosa in due stati, non due funzioni.
 */
function Bell({ on }: { on: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`h-14 w-14 ${on ? "text-emerald-600" : "text-slate-300"}`}
      aria-hidden
    >
      <path
        d="M6.5 9a5.5 5.5 0 0 1 11 0c0 3.3.7 4.9 1.4 5.7.4.5 0 1.3-.6 1.3H5.7c-.6 0-1-.8-.6-1.3.7-.8 1.4-2.4 1.4-5.7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 19a2 2 0 0 0 3.6 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {on ? (
        <path
          d="M19.8 5.2a7.5 7.5 0 0 1 1.7 3.4M4.2 5.2a7.5 7.5 0 0 0-1.7 3.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="m4 4 16 16"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Se le chiavi non sono ancora configurate il riquadro non compare:
    // meglio assente che presente e rotto. Appare da solo appena la chiave
    // pubblica arriva tra le variabili d'ambiente.
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      setState("unsupported");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    setState(subscription ? "on" : "off");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Chiave delle notifiche non configurata.");

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Attivazione fallita.");
      }

      setState("on");
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`,
          { method: "DELETE" },
        );
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") return null;

  if (state === "unsupported") return null;

  if (state === "denied") {
    return (
      <Box>
        <p className="font-medium">Notifiche bloccate</p>
        <p className="mt-1 text-sm text-slate-600">
          Le hai rifiutate in passato. Per riattivarle serve cambiare il
          permesso dalle impostazioni del browser per questo sito.
        </p>
      </Box>
    );
  }

  return (
    <Box>
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <Bell on={state === "on"} />

        <div>
          <p className="text-lg font-semibold">
            {state === "on" ? "Promemoria attivi" : "Promemoria disattivati"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {state === "on"
              ? "Su questo dispositivo ti avviso qualche ora prima del blocco, se ti mancano dei pronostici."
              : "Attivali per ricevere un avviso qualche ora prima del blocco, se ti mancano dei pronostici."}
          </p>
        </div>

        <button
          onClick={state === "on" ? disable : enable}
          disabled={busy}
          className={`w-full rounded-xl px-4 py-3.5 font-semibold disabled:opacity-50 ${
            state === "on"
              ? "border border-slate-300 text-slate-700"
              : "bg-slate-900 text-white"
          }`}
        >
          {busy ? "Un attimo…" : state === "on" ? "Disattiva" : "Attiva"}
        </button>

        <p className="text-xs text-slate-500">
          Il permesso vale solo per questo dispositivo: se usi anche il
          computer, vanno attivate anche lì.
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </Box>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      {children}
    </section>
  );
}
