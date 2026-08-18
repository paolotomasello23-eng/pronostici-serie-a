import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { serviceClient } from "@/lib/supabase/server";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

/** Registra il dispositivo per ricevere le notifiche. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Iscrizione non valida." }, { status: 400 });
  }

  const { endpoint, keys } = parsed.data;

  // Lo stesso dispositivo che si riscrive ripete lo stesso endpoint: invece
  // di accumulare doppioni si aggiorna la riga, e si azzera l'eventuale
  // marchio di iscrizione morta (magari l'utente ha ridato il permesso).
  const { error } = await serviceClient().from("push_subscriptions").upsert(
    {
      player_id: session.playerId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      failed_at: null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[/api/push/subscribe] salvataggio fallito:", error);
    return NextResponse.json(
      { error: "Non è stato possibile attivare le notifiche." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

/** Disattiva le notifiche per questo dispositivo. */
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) {
    return NextResponse.json({ error: "Dispositivo non indicato." }, { status: 400 });
  }

  await serviceClient()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("player_id", session.playerId);

  return NextResponse.json({ ok: true });
}
