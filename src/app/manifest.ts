import type { MetadataRoute } from "next";

/**
 * Rende l'app installabile: da "Aggiungi a Home" diventa un'icona a sé,
 * che si apre a schermo intero senza la barra degli indirizzi.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pronostici Serie A",
    short_name: "Pronostici",
    description: "Pronostici di Serie A tra amici",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    lang: "it",
    icons: [
      { src: "/icon", sizes: "192x192", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
