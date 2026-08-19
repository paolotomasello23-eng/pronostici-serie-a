import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { serviceClient } from "@/lib/supabase/server";
import { ProfileEditor } from "./editor";

export default async function ProfiloPage() {
  const session = await getSession();
  if (!session) redirect("/entra");

  // La riga è la propria: la si legge con la chiave di servizio perché
  // `players` non è accessibile dai browser, e non deve diventarlo.
  const { data: player } = await serviceClient()
    .from("players")
    .select("avatar_url")
    .eq("id", session.playerId)
    .maybeSingle();

  return (
    <ProfileEditor
      username={session.username}
      initialAvatarUrl={(player?.avatar_url as string | null) ?? null}
    />
  );
}
