import { ImageResponse } from "next/og";

/**
 * Favicon e icona per il manifest.
 *
 * Generata come PNG e non servita come SVG: iOS non accetta immagini
 * vettoriali per la schermata Home, e non trovandone una utilizzabile
 * ripiega sull'iniziale del nome dell'app — la "P" di Pronostici.
 */
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#ffffff",
          fontSize: 68,
          fontWeight: 700,
          letterSpacing: 2,
        }}
      >
        1X2
      </div>
    ),
    size,
  );
}
