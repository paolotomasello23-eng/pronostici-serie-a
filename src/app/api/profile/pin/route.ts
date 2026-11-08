import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { serviceClient } from "@/lib/supabase/server";
import { hashPin, isValidPinFormat, PIN_LENGTH, verifyPin } from "@/lib/auth/pin";

const schema = z.object({
  currentPin: z.string(),
  newPin: z.string(),
});

/**
 * Cambia il proprio PIN.
 *
 * Serve quello attuale anche a sessione aperta: un telefono lasciato sul
 * tavolo non deve bastare a chiudere fuori il suo proprietario. E passa
 * dallo stesso controllo del login, con lo stesso freno ai tentativi.
 *
 * È anche il seguito naturale del PIN assegnato dall'admin: quello lo
 * conosce chi l'ha scelto, e va sostituito con uno che conosca solo tu.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isValidPinFormat(parsed.data.newPin)) {
    return NextResponse.json(
      { error: `Il nuovo PIN deve essere di ${PIN_LENGTH} cifre.` },
      { status: 400 },
    );
  }

  const { currentPin, newPin } = parsed.data;
  const admin = serviceClient();

  const check = isValidPinFormat(currentPin)
    ? await verifyPin(admin, session.playerId, currentPin)
    : ({ ok: false, reason: "wrong", attemptsLeft: -1 } as const);

  if (!check.ok) {
    if (check.reason === "locked") {
      const minutes = Math.max(
        1,
        Math.ceil((check.until.getTime() - Date.now()) / 60_000),
      );
      return NextResponse.json(
        { error: `Troppi tentativi sbagliati. Riprova tra ${minutes} minuti.` },
        { status: 429 },
      );
    }
    return NextResponse.json(
      {
        error:
          check.attemptsLeft > 0
            ? `PIN attuale sbagliato. Hai ancora ${check.attemptsLeft} tentativi.`
            : "PIN attuale sbagliato.",
      },
      { status: 401 },
    );
  }

  const { error } = await admin
    .from("players")
    .update({ pin_hash: await hashPin(newPin), failed_attempts: 0, locked_until: null })
    .eq("id", session.playerId);

  if (error) {
    console.error("[/api/profile/pin] cambio PIN fallito:", error);
    return NextResponse.json({ error: "Cambio non riuscito." }, { status: 500 });
  }

  await admin.from("audit_log").insert({
    actor_id: session.playerId,
    action: "player.change_pin",
    entity: "player",
    entity_id: session.playerId,
  });

  return NextResponse.json({ ok: true });
}
