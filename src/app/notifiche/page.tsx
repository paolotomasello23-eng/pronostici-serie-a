import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { PushToggle } from "@/components/push-toggle";

export default async function NotifichePage() {
  const session = await getSession();
  if (!session) redirect("/entra");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-5">
      <header className="pt-4">
        <h1 className="text-2xl font-bold tracking-tight">Notifiche</h1>
      </header>

      <PushToggle />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Quando arrivano</p>
        <p className="mt-1">
          Nelle ore che precedono il blocco della giornata, e solo se hai
          ancora delle partite da compilare. Se hai già finito, non ti
          disturbo.
        </p>
      </section>
    </main>
  );
}
