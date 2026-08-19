/**
 * Immagine del profilo, o le iniziali di chi non ne ha una.
 *
 * Senza direttiva "use client": è solo markup, quindi funziona sia nelle
 * pagine server sia in quelle interattive.
 */
export function Avatar({
  src,
  name,
  size = 40,
}: {
  src?: string | null;
  name: string;
  size?: number;
}) {
  const iniziale = name.trim().charAt(0).toUpperCase() || "?";

  if (!src) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-500"
      >
        {iniziale}
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
      className="shrink-0 rounded-full bg-slate-100 object-cover"
    />
  );
}
