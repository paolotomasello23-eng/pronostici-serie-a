import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "./nav";

export const metadata: Metadata = {
  title: "Pronostici Serie A",
  description: "Pronostici di Serie A tra amici",
  appleWebApp: {
    capable: true,
    title: "Pronostici",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f172a",
  // Il contenuto arriva fin sotto la tacca e la barra gesti; gli spazi di
  // sicurezza li gestiamo noi dove servono.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body className="min-h-dvh">
        {children}
        <Nav />
      </body>
    </html>
  );
}
