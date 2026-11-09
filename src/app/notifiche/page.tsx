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
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
          <li>Quando si aprono i pronostici di una giornata.</li>
          <li>
            Nelle ore che precedono il blocco, solo se hai ancora delle
            partite da compilare. Se hai già finito, non ti disturbo.
          </li>
          <li>Poco prima del blocco, un ultimo avviso a tutti.</li>
          <li>A giornata finita, con i tuoi punti e la tua posizione.</li>
        </ul>
        <p className="mt-2">Mai di notte, fra le 23 e le 8.</p>
      </section>
    </main>
  );
}
