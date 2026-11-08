"use client";

import { useEffect } from "react";

/**
 * L'iscrizione alle notifiche di questo dispositivo, se c'è.
 *
 * Il permesso appartiene al browser, non all'account: se su questo telefono
 * qualcuno è uscito ed è entrato qualcun altro, l'iscrizione è la stessa ma
 * va intestata a chi c'è adesso.
 */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Intesta l'iscrizione all'utente collegato in questo momento. */
export async function bindSubscription(subscription: PushSubscription): Promise<boolean> {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  return response.ok;
}

/** Stacca questo dispositivo dall'account: si usa all'uscita. */
export async function unbindSubscription(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await fetch(
    `/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`,
    { method: "DELETE" },
  );
}

/**
 * Riallinea in silenzio l'iscrizione all'utente collegato.
 *
 * Senza, su un telefono passato di mano le notifiche continuavano ad
 * arrivare con il nome di chi c'era prima ("Marco, mancano 3 pronostici"),
 * e chi c'è adesso vedeva "Promemoria attivi" senza riceverne nessuno.
 * All'uscita il dispositivo viene staccato: questo lo riattacca appena si
 * rientra.
 */
export function PushSync() {
  useEffect(() => {
    void (async () => {
      try {
        if (typeof Notification === "undefined") return;
        if (Notification.permission !== "granted") return;
        const subscription = await currentSubscription();
        if (subscription) await bindSubscription(subscription);
      } catch {
        // Nessun danno: al massimo resta l'iscrizione di prima.
      }
    })();
  }, []);

  return null;
}
