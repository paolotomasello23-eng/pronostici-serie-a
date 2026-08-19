"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Conferma di uscita.
 *
 * Il pulsante rosso è quello che esce, non quello che annulla: chi tocca
 * per riflesso il primo bottone che vede deve trovarsi al sicuro, non
 * fuori. Per rientrare serve di nuovo il PIN, e vale la pena ricordarlo
 * prima e non dopo.
 */
export function ExitConfirm({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function exit() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/entra");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Vuoi uscire?</h1>
        <p className="mt-2 text-slate-600">
          Stai uscendo come <strong>{displayName}</strong>. Per rientrare ti
          serviranno il codice della lega e il tuo PIN.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={exit}
          disabled={busy}
          className="rounded-xl bg-red-600 px-5 py-4 text-lg font-semibold text-white active:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Esco…" : "Esci"}
        </button>

        <button
          onClick={() => router.back()}
          disabled={busy}
          className="rounded-xl border border-slate-300 bg-white px-5 py-4 text-lg font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-50"
        >
          Annulla
        </button>
      </div>
    </main>
  );
}
