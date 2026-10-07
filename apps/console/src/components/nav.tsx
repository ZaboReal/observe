"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Building2, Code2, LayoutGrid, ListTree, ScrollText } from "lucide-react";

import { SITE } from "@/lib/site";

const GROUPS = [
  {
    label: "Monitor",
    items: [
      { href: "/", label: "Overview", icon: LayoutGrid },
      { href: "/sessions", label: "Sessions", icon: ListTree },
      { href: "/agents", label: "Agents", icon: Bot },
      { href: "/accounts", label: "Accounts", icon: Building2 },
    ],
  },
  {
    label: "Govern",
    items: [{ href: "/log", label: "Entry log", icon: ScrollText }],
  },
  {
    label: "Workspace",
    items: [{ href: "/setup", label: "Setup", icon: Code2 }],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <rect width="20" height="20" rx="6" fill="currentColor" />
        <circle cx="10" cy="10" r="4.25" fill="none" stroke="white" strokeWidth="1.75" />
        <circle cx="10" cy="10" r="1.4" fill="white" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.01em]">Observe</span>
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-line bg-canvas md:flex">
      <div className="px-5 pt-5 pb-4">
        <Link href="/" className="text-ink">
          <Logo />
        </Link>
      </div>

      <div className="mx-3 mb-4 rounded-lg border border-line px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium">{SITE.name}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <span className="size-1.5 rounded-full bg-ink" />
            {SITE.environment}
          </span>
        </div>
        <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-3">{SITE.host}</div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3" aria-label="Main">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-1.5 text-[11px] font-medium tracking-wide text-ink-4 uppercase">{group.label}</div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] transition-colors ${
                        active ? "bg-wash-2 font-medium text-ink" : "text-ink-2 hover:bg-wash hover:text-ink"
                      }`}
                    >
                      <Icon size={16} strokeWidth={active ? 2 : 1.75} className={active ? "text-ink" : "text-ink-3"} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-lg bg-wash px-3 py-3">
        <div className="flex items-center gap-2 text-[12.5px] font-medium">
          <span className="inline-block size-2 rounded-full border-[1.5px] border-ink" />
          Observe mode
        </div>
        <p className="mt-1 text-[12px] leading-snug text-ink-3">Decisions are computed and logged. Nothing is blocked.</p>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur md:hidden">
      <div className="flex h-12 items-center justify-between px-4">
        <Link href="/" className="text-ink">
          <Logo />
        </Link>
        <span className="truncate font-mono text-[11.5px] text-ink-3">{SITE.host}</span>
      </div>
      <nav className="flex gap-1 no-scrollbar overflow-x-auto px-3 pb-2" aria-label="Main">
        {ALL.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1 text-[13px] ${active ? "bg-ink text-canvas" : "text-ink-2"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
