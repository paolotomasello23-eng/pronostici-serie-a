"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Quando una pagina non riesce a leggere i suoi dati.
 *
 * Meglio dirlo che mostrare una classifica vuota o a metà: a zero punti
 * sembra vera, e nessuno pensa di ricaricare. Di solito è un intoppo di
 * rete o del database, e un secondo tentativo basta.
 */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Qualcosa non è andato</h1>
      <p className="text-slate-600">
        Non sono riuscito a caricare i dati. Riprova fra qualche secondo.
      </p>
      <button
        // Da solo `reset` ridisegna la pagina con i dati di prima: serve
        // anche `refresh` perché il server li rilegga davvero.
        onClick={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
        className="rounded-xl bg-slate-900 px-5 py-4 text-lg font-semibold text-white active:bg-slate-700"
      >
        Riprova
      </button>
    </main>
  );
}
