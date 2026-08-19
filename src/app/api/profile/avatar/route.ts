import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { serviceClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/** Il file arriva già rimpicciolito dal telefono: questo è solo un tetto. */
const MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Carica l'immagine del profilo.
 *
 * Il caricamento passa dal nostro server e non direttamente dal browser:
 * così la chiave che può scrivere nel contenitore non lascia mai il server,
 * e il tipo e il peso del file vengono controllati prima che il file esista.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nessuna immagine ricevuta." }, { status: 400 });
  }

  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "Formato non supportato: usa JPG, PNG o WEBP." },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Immagine troppo grande." },
      { status: 413 },
    );
  }

  const admin = serviceClient();
  const path = `${session.playerId}.jpg`;

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    console.error("[/api/profile/avatar] caricamento fallito:", uploadError);
    return NextResponse.json(
      { error: "Non è stato possibile caricare l'immagine." },
      { status: 500 },
    );
  }

  // Il numero in coda forza il telefono a riscaricare l'immagine: senza,
  // l'indirizzo resterebbe identico e continuerebbe a mostrare la vecchia
  // foto rimasta in cache.
  const url = `${env.supabaseUrl}/storage/v1/object/public/avatars/${path}?v=${Date.now()}`;

  const { error } = await admin
    .from("players")
    .update({ avatar_url: url })
    .eq("id", session.playerId);

  if (error) {
    console.error("[/api/profile/avatar] salvataggio indirizzo fallito:", error);
    return NextResponse.json({ error: "Salvataggio fallito." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, avatarUrl: url });
}

/** Toglie l'immagine del profilo. */
export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const admin = serviceClient();

  await admin.storage.from("avatars").remove([`${session.playerId}.jpg`]);
  await admin
    .from("players")
    .update({ avatar_url: null })
    .eq("id", session.playerId);

  return NextResponse.json({ ok: true });
}
