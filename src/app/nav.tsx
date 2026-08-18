"use client";

import { usePathname } from "next/navigation";

/**
 * Barra di navigazione in basso: sul telefono è la zona che il pollice
 * raggiunge senza spostare la mano.
 *
 * Sparisce nelle schermate di accesso, dove non c'è ancora niente da
 * navigare e un menu sarebbe solo rumore.
 */
const LINKS = [
  { href: "/", label: "Lega" },
  { href: "/pronostici", label: "Pronostici" },
  { href: "/classifica", label: "Classifica" },
] as const;

const HIDDEN_ON = ["/entra", "/crea-lega"];

export function Nav() {
  const pathname = usePathname();

  if (HIDDEN_ON.some((path) => pathname.startsWith(path))) return null;

  return (
    <>
      {/* Lascia spazio sotto il contenuto, così la barra non copre l'ultima riga. */}
      <div aria-hidden className="h-20" />

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto flex max-w-md">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <li key={link.href} className="flex-1">
                <a
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`block px-2 py-4 text-center text-sm font-medium ${
                    active ? "text-slate-900" : "text-slate-500"
                  }`}
                >
                  <span
                    className={`block ${active ? "border-t-2 border-slate-900 pt-1" : "pt-1"}`}
                  >
                    {link.label}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
