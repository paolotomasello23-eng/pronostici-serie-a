export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pronostici Serie A</h1>
        <p className="mt-2 text-slate-600">
          Setup completato. Il motore di punteggio è pronto e testato.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">Prossima milestone</p>
        <p className="mt-1 text-lg font-semibold">
          M2 — Database, lega e login con PIN
        </p>
      </div>

      <p className="text-sm text-slate-500">
        Per verificare le regole di punteggio:{" "}
        <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">
          npm test
        </code>
      </p>
    </main>
  );
}
