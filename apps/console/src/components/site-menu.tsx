"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";

import { chooseSite } from "@/app/actions";

export interface SiteChoice {
  id: string;
  name: string;
  host: string;
  /** "Demo" for generated traffic, otherwise the site's environment (e.g. "Pilot"). */
  tag: string;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={`shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
      <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The sidebar's site switcher: which site the console is showing. */
export function SiteMenu({ sites, current }: { sites: SiteChoice[]; current: SiteChoice }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const pick = (id: string) => {
    setOpen(false);
    if (id !== current.id) start(() => chooseSite(id, pathname));
  };

  // One site: nothing to choose, so just name it.
  if (sites.length < 2) {
    return (
      <div className="px-2.5">
        <div className="eyebrow truncate">{current.name}</div>
        <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-3">{current.host}</div>
      </div>
    );
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-ink/[0.04] ${open ? "bg-ink/[0.04]" : ""} ${pending ? "opacity-60" : ""}`}
      >
        <span className="min-w-0 flex-1">
          <span className="eyebrow block truncate">{current.name}</span>
          <span className="mt-0.5 block truncate font-mono text-[11.5px] text-ink-3">{current.host}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <ul role="listbox" aria-label="Site" className="menu-rise absolute inset-x-0 top-[calc(100%+4px)] z-40 rounded-[14px] bg-sheet p-1.5 shadow-lift">
          {sites.map((s) => (
            <li key={s.id} role="option" aria-selected={s.id === current.id}>
              <button
                type="button"
                onClick={() => pick(s.id)}
                className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-ink/[0.04] ${s.id === current.id ? "bg-green/10" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13.5px] ${s.id === current.id ? "font-medium text-green" : "text-ink"}`}>{s.name}</span>
                  <span className="block truncate font-mono text-[11px] text-ink-3">{s.host}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-px text-[11px] font-medium ${s.tag === "Demo" ? "bg-ink/[0.05] text-ink-2" : "bg-green/10 text-green"}`}>{s.tag}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The same choice in the phone menu, as a row of pills. */
export function SitePills({ sites, current }: { sites: SiteChoice[]; current: SiteChoice }) {
  const pathname = usePathname();
  const [pending, start] = useTransition();
  if (sites.length < 2) return <div className="eyebrow mb-2 px-3">{current.name}</div>;
  return (
    <div role="radiogroup" aria-label="Site" className={`mb-3 flex gap-1.5 px-1 ${pending ? "opacity-60" : ""}`}>
      {sites.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={s.id === current.id}
          onClick={() => s.id !== current.id && start(() => chooseSite(s.id, pathname))}
          className={`min-w-0 flex-1 truncate rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${s.id === current.id ? "bg-ink text-white" : "bg-ink/[0.05] text-ink-2"}`}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}
