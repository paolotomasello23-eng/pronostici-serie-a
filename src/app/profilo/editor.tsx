"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/avatar";

/** Lato del quadrato salvato: basta e avanza per un cerchietto in lista. */
const SIZE = 400;

/**
 * Ritaglia l'immagine al centro, la rende quadrata e la rimpicciolisce
 * prima di spedirla.
 *
 * Una foto scattata col telefono pesa svariati megabyte: mandarla intera
 * per poi mostrarla in un cerchio da 40 pixel significherebbe far aspettare
 * chi la carica e chi la guarda, per una qualità che nessuno vedrà.
 */
async function prepara(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const lato = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - lato) / 2;
  const sy = (bitmap.height - lato) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossibile elaborare l'immagine.");
  ctx.drawImage(bitmap, sx, sy, lato, lato, 0, 0, SIZE, SIZE);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Conversione non riuscita.")),
      "image/jpeg",
      0.85,
    );
  });
}

export function ProfileEditor({
  username,
  initialAvatarUrl,
}: {
  username: string;
  initialAvatarUrl: string | null;
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function scegli(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Azzerato subito, altrimenti riselezionare lo stesso file non
    // scatenerebbe un nuovo evento e sembrerebbe che non funzioni.
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const blob = await prepara(file);
      const form = new FormData();
      form.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Caricamento fallito.");

      setAvatarUrl(data.avatarUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rimuovi() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/profile/avatar", { method: "DELETE" });
      if (!response.ok) throw new Error("Rimozione fallita.");
      setAvatarUrl(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-5">
      <header className="pt-4">
        <h1 className="text-2xl font-bold tracking-tight">Il mio profilo</h1>
      </header>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <section className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label="Cambia immagine del profilo"
          className="relative rounded-full disabled:opacity-50"
        >
          <span className="block overflow-hidden rounded-full ring-4 ring-slate-100">
            <Avatar src={avatarUrl} name={username} size={128} />
          </span>
          <span
            aria-hidden
            className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full border-4 border-white bg-slate-900 text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M4 8.5h3.2l1.4-2h6.8l1.4 2H20a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="14" r="3.2" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </span>
        </button>

        <input
          ref={input}
          type="file"
          accept="image/*"
          onChange={scegli}
          className="hidden"
        />

        <p className="text-sm text-slate-500">
          {busy ? "Un attimo…" : "Tocca il cerchio per cambiare immagine"}
        </p>

        {avatarUrl && !busy && (
          <button
            onClick={rimuovi}
            className="text-sm text-red-700 underline"
          >
            Rimuovi immagine
          </button>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-sm font-medium text-slate-500">Nome utente</p>
        <p className="mt-1 text-xl font-bold">{username}</p>
        <p className="mt-2 text-xs text-slate-500">
          È il nome con cui accedi e con cui ti vedono gli altri.
        </p>
      </section>
    </main>
  );
}
