/*
 * Service worker: resta in ascolto anche quando l'app è chiusa, ed è ciò
 * che permette al telefono di ricevere le notifiche.
 *
 * Volutamente essenziale: non mette in cache niente e non intercetta la
 * navigazione. Una cache sbagliata qui significherebbe utenti bloccati su
 * una versione vecchia dell'app senza capire perché.
 */

self.addEventListener("install", () => {
  // Entra in servizio subito, senza aspettare che le schede aperte si chiudano.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Pronostici Serie A";
  const options = {
    body: payload.body || "",
    icon: "/icon",
    badge: "/icon",
    // Notifiche con lo stesso tag si sostituiscono: se per qualsiasi motivo
    // ne partissero due, l'utente ne vede comunque una sola.
    tag: payload.tag || "pronostici",
    data: { url: payload.url || "/pronostici" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Se l'app è già aperta la si porta in primo piano, invece di
        // aprire l'ennesima scheda.
        for (const client of clients) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
