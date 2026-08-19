"use client";

import { usePathname } from "next/navigation";

/**
 * Barra di navigazione in basso: sul telefono è la zona che il pollice
 * raggiunge senza spostare la mano.
 *
 * Solo icone, tranne quella attiva che apre una linguetta con il nome. Con
 * quattro voci, mostrare tutte le etichette costringerebbe a caratteri
 * minuscoli; così restano leggibili le icone, e il nome compare dove serve
 * davvero — su dove ti trovi adesso.
 *
 * Sparisce nelle schermate di accesso, dove non c'è ancora niente da
 * navigare.
 */

const HIDDEN_ON = ["/entra", "/crea-lega", "/leghe"];

type IconProps = { className?: string };

/** Casa: la schermata della lega. */
function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Schedina con le crocette: i pronostici. */
function TicketIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect
        x="4" y="3" width="16" height="18" rx="2.5"
        stroke="currentColor" strokeWidth="1.8"
      />
      <path
        d="m8 9 1.6 1.6L13 7.2M8 15.5h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Coppa: la classifica. */
function TrophyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M7 4h10v5a5 5 0 0 1-10 0V4Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      <path
        d="M7 5.5H4.5v1A3.5 3.5 0 0 0 8 10M17 5.5h2.5v1A3.5 3.5 0 0 1 16 10M12 14v3.5M8.5 21h7l-.7-3.5h-5.6L8.5 21Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Barre crescenti: le statistiche. */
function ChartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 20h16"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      />
      <rect
        x="5.5" y="12" width="3.5" height="5" rx="1"
        stroke="currentColor" strokeWidth="1.8"
      />
      <rect
        x="10.5" y="8" width="3.5" height="9" rx="1"
        stroke="currentColor" strokeWidth="1.8"
      />
      <rect
        x="15.5" y="4" width="3.5" height="13" rx="1"
        stroke="currentColor" strokeWidth="1.8"
      />
    </svg>
  );
}

const LINKS = [
  { href: "/", label: "Lega", Icon: HomeIcon },
  { href: "/pronostici", label: "Pronostici", Icon: TicketIcon },
  { href: "/classifica", label: "Classifica", Icon: TrophyIcon },
  { href: "/statistiche", label: "Statistiche", Icon: ChartIcon },
] as const;

export function Nav() {
  const pathname = usePathname();

  if (HIDDEN_ON.some((path) => pathname.startsWith(path))) return null;

  return (
    <>
      {/* Lascia spazio sotto il contenuto, così la barra non copre l'ultima riga. */}
      <div aria-hidden className="h-20" />

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
          {LINKS.map(({ href, label, Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <li key={href}>
                <a
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={label}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-2.5 transition-colors duration-200 ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 active:bg-slate-100"
                  }`}
                >
                  <Icon className="h-6 w-6 shrink-0" />

                  {/* Il nome scivola fuori solo sulla voce attiva. La griglia
                      che passa da 0fr a 1fr è ciò che rende animabile una
                      larghezza che altrimenti sarebbe "auto". */}
                  <span
                    className="grid transition-all duration-300 ease-out"
                    style={{ gridTemplateColumns: active ? "1fr" : "0fr" }}
                  >
                    <span className="overflow-hidden whitespace-nowrap text-sm font-semibold">
                      {label}
                    </span>
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
