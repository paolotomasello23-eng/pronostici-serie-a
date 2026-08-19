"use client";

import { useEffect, useState } from "react";

/**
 * Menu laterale, aperto dal pulsante in alto a destra.
 *
 * Raccoglie le voci che non servono ogni giorno — notifiche, regole,
 * pannello admin, uscita — togliendole dalla schermata principale, che così
 * mostra solo quello che si guarda davvero: quanto manca e chi gioca.
 */

type IconProps = { className?: string };

function MenuIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UserIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="8.5" r="3.8" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4.8 20c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LeaguesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M6 9a6 6 0 0 1 12 0c0 3.5.8 5.2 1.5 6.1.4.5 0 1.4-.7 1.4H5.2c-.7 0-1.1-.9-.7-1.4C5.2 14.2 6 12.5 6 9Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M10 19.5a2.2 2.2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HelpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9.6 9.3a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2-2.4 3.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.8" r="1" fill="currentColor" />
    </svg>
  );
}

function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 3.2 19 6v6c0 4.2-2.9 7.3-7 8.8-4.1-1.5-7-4.6-7-8.8V6l7-2.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="m9 12.2 2 2 4-4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExitIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M10 8.5 6.5 12 10 15.5M6.8 12H15"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppMenu({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);

  // Con il menu aperto la pagina sotto non deve scorrere: su un telefono è
  // fastidiosissimo trascinare il menu e vedere muoversi il contenuto.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Apri il menu"
        aria-expanded={open}
        className="rounded-xl p-2 text-slate-600 active:bg-slate-100"
      >
        <MenuIcon className="h-7 w-7" />
      </button>

      {/* Lo sfondo scuro chiude il menu: è il gesto che tutti si aspettano. */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={`fixed inset-0 z-30 bg-slate-900/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-label="Menu"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-40 flex w-64 flex-col bg-white shadow-xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          <span className="font-semibold">Menu</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Chiudi il menu"
            className="rounded-lg px-2 py-1 text-2xl leading-none text-slate-400 active:bg-slate-100"
          >
            ×
          </button>
        </div>

        <nav className="flex flex-col p-2">
          <Item
            href="/profilo"
            label="Il mio profilo"
            Icon={UserIcon}
            tabIndex={open ? 0 : -1}
          />
          <Item
            href="/leghe"
            label="Le mie leghe"
            Icon={LeaguesIcon}
            tabIndex={open ? 0 : -1}
          />
          <Item href="/notifiche" label="Notifiche" Icon={BellIcon} tabIndex={open ? 0 : -1} />
          <Item href="/regole" label="Regole" Icon={HelpIcon} tabIndex={open ? 0 : -1} />
          {isAdmin && (
            <Item
              href="/admin"
              label="Admin"
              Icon={ShieldIcon}
              tabIndex={open ? 0 : -1}
              gold
            />
          )}
          <Item
            href="/esci"
            label="Esci"
            Icon={ExitIcon}
            tabIndex={open ? 0 : -1}
            danger
          />
        </nav>
      </aside>
    </>
  );
}

function Item({
  href,
  label,
  Icon,
  tabIndex,
  danger,
  gold,
}: {
  href: string;
  label: string;
  Icon: (props: IconProps) => React.ReactElement;
  tabIndex: number;
  danger?: boolean;
  gold?: boolean;
}) {
  const tone = danger
    ? "text-red-700 active:bg-red-50"
    : gold
      ? "text-amber-600 active:bg-amber-50"
      : "text-slate-700 active:bg-slate-100";

  return (
    <a
      href={href}
      tabIndex={tabIndex}
      className={`flex items-center gap-3 rounded-xl px-3 py-3.5 font-medium ${tone}`}
    >
      <Icon className="h-6 w-6 shrink-0" />
      {label}
    </a>
  );
}
