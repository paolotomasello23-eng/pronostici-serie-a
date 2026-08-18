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
  | "needs-install" // iPhone: senza app sulla Home, iOS non le consegna
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

function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // Gli iPad recenti si presentano come Mac, ma hanno il touch.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
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
      // Su iPhone il supporto compare solo dopo l'installazione: distinguere
      // i due casi evita di dire "non supportato" a chi invece può averle.
      setState(isIos() && !isStandalone() ? "needs-install" : "unsupported");
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

  if (state === "needs-install") {
    return (
      <Box>
        <p className="font-medium">Vuoi il promemoria sul telefono?</p>
        <p className="mt-1 text-sm text-slate-600">
          Su iPhone le notifiche funzionano solo con l&apos;app aggiunta alla
          schermata Home: tocca <strong>Condividi</strong> e poi{" "}
          <strong>Aggiungi a Home</strong>. Poi riapri l&apos;app da lì e torna
          qui.
        </p>
      </Box>
    );
  }

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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {state === "on" ? "Promemoria attivi" : "Promemoria del blocco"}
          </p>
          <p className="text-sm text-slate-600">
            {state === "on"
              ? "Su questo dispositivo. Ti avviso qualche ora prima se non hai compilato."
              : "Ti avviso qualche ora prima del blocco se ti mancano dei pronostici."}
          </p>
        </div>
        <button
          onClick={state === "on" ? disable : enable}
          disabled={busy}
          className={`shrink-0 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 ${
            state === "on"
              ? "border border-slate-300"
              : "bg-slate-900 text-white"
          }`}
        >
          {busy ? "…" : state === "on" ? "Disattiva" : "Attiva"}
        </button>
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
