"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { num } from "@/lib/format";

import { LogoMark } from "./logo";
import { SiteMenu, SitePills, type SiteChoice } from "./site-menu";

const MAIN = [
  { href: "/", label: "Overview" },
  { href: "/sessions", label: "Sessions" },
  { href: "/agents", label: "Agents" },
  { href: "/accounts", label: "Accounts" },
  { href: "/activity", label: "Activity" },
  { href: "/rules", label: "Rules" },
];
const SETUP = { href: "/setup", label: "Setup" };

/** Pages that stand on their own, without the console's navigation. */
const BARE = ["/login"];

export interface SiteInfo extends SiteChoice {
  /** Sessions live right now; null when it is not shown (signed out). */
  live: number | null;
  /** Every site this console watches, for the site menu. */
  sites: SiteChoice[];
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, label, pathname, big = false, onClick }: { href: string; label: string; pathname: string; big?: boolean; onClick?: () => void }) {
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={
        big
          ? `block rounded-[10px] px-3 py-1.5 text-[22px] font-medium tracking-[-0.02em] transition-colors ${active ? "text-green" : "text-ink hover:text-green"}`
          : `block rounded-lg px-2.5 py-[7px] text-[14px] transition-colors ${active ? "bg-green/10 font-medium text-green" : "text-ink-body hover:bg-ink/[0.04] hover:text-ink"}`
      }
    >
      {label}
    </Link>
  );
}

function LiveLine({ live }: { live: number | null }) {
  if (live === null) return null;
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-1 text-[13px] text-ink-2">
      <span className="live" aria-hidden="true" />
      <span>
        <span className="tabular">{num(live)}</span> {live === 1 ? "session" : "sessions"} now
      </span>
    </div>
  );
}

function ObserveNote() {
  return (
    <div className="rounded-xl bg-sheet px-3 py-2.5 shadow-ring">
      <div className="flex items-center gap-2 text-[12.5px] font-medium">
        <span className="inline-block size-2 rounded-full border-[1.5px] border-ink" aria-hidden="true" />
        Observe mode
      </div>
      <p className="mt-0.5 text-[12px] leading-snug text-ink-2">Decisions are logged, nothing is blocked.</p>
    </div>
  );
}

export function Sidebar({ site }: { site: SiteInfo }) {
  const pathname = usePathname();
  if (BARE.includes(pathname)) return null;
  return (
    <div className="hidden w-[232px] shrink-0 border-r border-line bg-side md:block">
      <aside className="sticky top-0 flex h-screen flex-col px-3.5 pt-[18px] pb-3.5">
        <Link href="/" className="flex items-center gap-2.5 rounded-full px-1" aria-label="Observe, overview">
          <LogoMark size={38} />
          <span className="text-[15.5px] font-medium tracking-[-0.01em]">Observe</span>
        </Link>

        <div className="mt-6">
          <SiteMenu sites={site.sites} current={site} />
        </div>

        <nav className="mt-2.5 flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="Main">
          <ul className="space-y-px">
            {MAIN.map((item) => (
              <li key={item.href}>
                <NavLink {...item} pathname={pathname} />
              </li>
            ))}
          </ul>
          {site.live !== null && (
            <>
              <div className="eyebrow mt-6 mb-1.5 px-2.5">Live</div>
              <LiveLine live={site.live} />
            </>
          )}
          <div className="mt-auto pt-4">
            <NavLink {...SETUP} pathname={pathname} />
          </div>
        </nav>

        <div className="mt-2">
          <ObserveNote />
        </div>
      </aside>
    </div>
  );
}

export function MobileNav({ site }: { site: SiteInfo }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Close on navigation, Escape, or a tap outside.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (BARE.includes(pathname)) return null;
  const current = [...MAIN, SETUP].find((i) => isActive(pathname, i.href));

  return (
    <div className="sticky top-0 z-30 border-b border-line bg-sheet/90 backdrop-blur-xl md:hidden">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <Link href="/" aria-label="Observe, overview" className="shrink-0">
          <LogoMark size={34} />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-medium">{current?.label ?? "Observe"}</div>
          <div className="truncate font-mono text-[11px] text-ink-3">{site.host}</div>
        </div>
        {site.live !== null && (
          <span className="flex shrink-0 items-center gap-2 text-[12.5px] text-ink-2 max-[359px]:hidden">
            <span className="live sm" aria-hidden="true" />
            <span className="tabular">{num(site.live)}</span>
          </span>
        )}
        <button
          ref={button}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-sheet px-3.5 text-[13.5px] font-medium shadow-ring"
        >
          <span className="relative block h-2.5 w-3.5" aria-hidden="true">
            <span className={`absolute inset-x-0 h-[1.6px] rounded bg-current transition-transform duration-300 ease-soft ${open ? "top-[4px] rotate-45" : "top-0"}`} />
            <span className={`absolute inset-x-0 h-[1.6px] rounded bg-current transition-transform duration-300 ease-soft ${open ? "top-[4px] -rotate-45" : "top-[8.4px]"}`} />
          </span>
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open && (
        <div ref={panel} id="mobile-menu" className="menu-rise absolute inset-x-4 top-[calc(100%+6px)] rounded-[22px] bg-sheet p-4 shadow-lift">
          <SitePills sites={site.sites} current={site} />
          <nav aria-label="Main">
            {MAIN.map((item) => (
              <NavLink key={item.href} {...item} pathname={pathname} big onClick={() => setOpen(false)} />
            ))}
            <div className="mt-2 border-t border-line pt-2">
              <NavLink {...SETUP} pathname={pathname} big onClick={() => setOpen(false)} />
            </div>
          </nav>
          <div className="mt-3 space-y-2.5">
            <LiveLine live={site.live} />
            <ObserveNote />
          </div>
        </div>
      )}
    </div>
  );
}
