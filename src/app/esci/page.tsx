import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ExitConfirm } from "./confirm";

export default async function EsciPage() {
  const session = await getSession();
  if (!session) redirect("/entra");

  return <ExitConfirm displayName={session.displayName} />;
}
