import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/lib/supabase/server";
import { normalizeInviteCode } from "@/lib/leagues";

const schema = z.object({ inviteCode: z.string().min(1).max(20) });

/**
 * Dato il codice d'invito, restituisce il nome della lega: la schermata di
 * ingresso lo usa per confermare il codice prima di chiedere nome e PIN.
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

  // Solo il nome della lega: basta a confermare di aver scritto il codice
  // giusto, e i nomi dei membri non servono a nessuna schermata.
  return NextResponse.json({ leagueName: league.name });
}
