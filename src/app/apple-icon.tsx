import { ImageResponse } from "next/og";

/**
 * L'icona che iPhone usa per la schermata Home.
 *
 * 180×180 è la misura che iOS si aspetta. Nessun angolo arrotondato nel
 * disegno: ci pensa il sistema a ritagliarla, e arrotondarla anche qui
 * lascerebbe una cornice scura attorno.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 64,
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
