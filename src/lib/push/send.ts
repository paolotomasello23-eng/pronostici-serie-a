import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Invio delle notifiche push.
 *
 * Le chiavi VAPID dicono ai servizi di push (Google, Apple, Mozilla) che
 * siamo noi a mandare il messaggio. Sono gratuite e le abbiamo generate una
 * volta sola: cambiarle invaliderebbe tutte le iscrizioni esistenti.
 */

let configured = false;

function configure(): void {
  if (configured) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    throw new Error(
      "Chiavi VAPID mancanti: servono NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.",
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface SendResult {
  sent: number;
  gone: number;
  failed: number;
}

/**
 * Manda una notifica a tutti i dispositivi di un giocatore.
 *
 * Un'iscrizione può morire senza avvisare: app disinstallata, permesso
 * revocato, browser ripulito. In quel caso il servizio risponde 404 o 410 e
 * noi la marchiamo come esaurita, invece di riprovare a ogni giornata per
 * il resto del campionato.
 */
export async function sendToPlayer(
  admin: SupabaseClient,
  playerId: string,
  payload: PushPayload,
): Promise<SendResult> {
  configure();

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("player_id", playerId)
    .is("failed_at", null);

  const result: SendResult = { sent: 0, gone: 0, failed: 0 };

  for (const subscription of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint as string,
          keys: {
            p256dh: subscription.p256dh as string,
            auth: subscription.auth as string,
          },
        },
        JSON.stringify(payload),
        { TTL: 3 * 60 * 60 }, // Dopo tre ore il promemoria non serve più.
      );

      await admin
        .from("push_subscriptions")
        .update({ last_ok_at: new Date().toISOString() })
        .eq("id", subscription.id as string);

      result.sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;

      if (status === 404 || status === 410) {
        await admin
          .from("push_subscriptions")
          .update({ failed_at: new Date().toISOString() })
          .eq("id", subscription.id as string);
        result.gone++;
      } else {
        console.error("[push] invio fallito:", status, (error as Error).message);
        result.failed++;
      }
    }
  }

  return result;
}
