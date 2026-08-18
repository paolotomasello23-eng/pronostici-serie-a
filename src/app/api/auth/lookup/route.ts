import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/lib/supabase/server";
import { normalizeInviteCode } from "@/lib/leagues";

const schema = z.object({ inviteCode: z.string().min(1).max(20) });

/**
 * Dato il codice d'invito, restituisce il nome della lega e chi ne fa già
 * parte, così al passo dopo si sceglie il proprio nome da una lista invece
 * di digitarlo (e sbagliarlo).
 *
 * Non espone nulla di riservato: i nomi dei membri li vede solo chi ha già
 * il codice, cioè chi è stato invitato.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const admin = serviceClient();
  const code = normalizeInviteCode(parsed.data.inviteCode);

  const { data: league } = await admin
    .from("leagues")
    .select("id, name")
    .eq("invite_code", code)
    .maybeSingle();

  if (!league) {
    return NextResponse.json(
      { error: "Codice non riconosciuto. Controlla di averlo scritto bene." },
      { status: 404 },
    );
  }

  const { data: members } = await admin
    .from("league_members")
    .select("display_name")
    .eq("league_id", league.id)
    .order("display_name");

  return NextResponse.json({
    leagueName: league.name,
    members: (members ?? []).map((m) => m.display_name as string),
    isFull: (members ?? []).length >= 10,
  });
}
