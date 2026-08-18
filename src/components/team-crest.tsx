/**
 * Stemma di una squadra.
 *
 * Immagine normale e non `next/image`: i file pesano pochi kilobyte e sono
 * sempre gli stessi venti, quindi il browser li tiene in cache dopo la prima
 * giornata. Passare dall'ottimizzazione di Vercel non darebbe alcun
 * vantaggio e consumerebbe una quota del piano gratuito.
 *
 * Senza direttiva "use client": è solo markup, quindi funziona sia nelle
 * pagine server sia in quelle interattive.
 */
export function TeamCrest({
  src,
  name,
  size = 24,
}: {
  src: string | null | undefined;
  name: string;
  size?: number;
}) {
  // Le squadre inserite a mano non hanno stemma: meglio l'iniziale di un
  // riquadro vuoto o di un'icona rotta.
  if (!src) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500"
      >
        {name.trim().charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      style={{ width: size, height: size }}
      className="shrink-0 object-contain"
    />
  );
}
