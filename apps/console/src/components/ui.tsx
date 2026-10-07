import Link from "next/link";
import { ArrowRight, CircleDashed, ScanEye, ShieldCheck, User } from "lucide-react";

import { TIER_LABEL } from "@/lib/format";
import { OUTCOME_LABEL } from "@/lib/policy";
import type { Outcome, Risk, Tier, Verdict } from "@/lib/types";

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-16 md:px-10 md:pt-9">{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-[13px] text-ink-3">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] md:text-[26px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[14px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`overflow-hidden rounded-xl border border-line bg-canvas ${className}`}>{children}</section>;
}

export function CardHeader({ title, description, action }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="text-[14px] font-medium">{title}</h2>
        {description && <p className="mt-0.5 text-[12.5px] text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex shrink-0 items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">
      {children}
      <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** A row of figures separated by hairlines. */
export function Stats({ children, cols = 4 }: { children: React.ReactNode; cols?: 3 | 4 | 5 }) {
  const grid = { 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5" }[cols];
  return <div className={`grid grid-cols-2 ${grid} [&>*]:border-line max-md:[&>*:nth-child(odd)]:border-r md:[&>*:not(:last-child)]:border-r max-md:[&>*:nth-child(n+3)]:border-t`}>{children}</div>;
}

export function Stat({ label, value, sub, mark }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; mark?: React.ReactNode }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
        {mark}
        {label}
      </div>
      <div className="mt-1.5 text-[26px] leading-none font-semibold tracking-[-0.02em]">{value}</div>
      {sub && <div className="mt-2 text-[12.5px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" }) {
  const base = `inline-flex items-center rounded-full font-medium whitespace-nowrap ${size === "sm" ? "h-[18px] px-1.5 text-[11px]" : "h-[22px] px-2 text-[12px]"}`;
  if (verdict === "agent") return <span className={`${base} bg-ink text-canvas`}>Agent</span>;
  if (verdict === "human") return <span className={`${base} border border-line-2 text-ink-2`}>Human</span>;
  return <span className={`${base} border border-dashed border-ink-4 text-ink-3`}>Unknown</span>;
}

/** A small swatch that matches how each verdict is drawn in charts. */
export function VerdictKey({ verdict }: { verdict: Verdict }) {
  if (verdict === "agent") return <span className="inline-block size-2.5 rounded-[3px] bg-agent" />;
  if (verdict === "human") return <span className="inline-block size-2.5 rounded-[3px] bg-human" />;
  return <span className="inline-block size-2.5 rounded-[3px] border border-dashed border-ink-3 bg-unknown" />;
}

const TIER_ICON = {
  verified: ShieldCheck,
  recognised: ScanEye,
  "unknown-automation": CircleDashed,
  human: User,
  unknown: CircleDashed,
} as const;

export function TierTag({ tier, size = "sm" }: { tier: Tier; size?: "sm" | "md" }) {
  const Icon = TIER_ICON[tier];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${size === "md" ? "text-[13px] text-ink" : "text-[12px] text-ink-3"}`}>
      <Icon size={13} strokeWidth={1.75} className={tier === "verified" ? "text-ink" : ""} />
      {TIER_LABEL[tier]}
    </span>
  );
}

export function RiskTag({ risk }: { risk: Risk }) {
  const bars = { low: 1, medium: 2, high: 3, critical: 4 }[risk];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 capitalize" title={`${risk} risk`}>
      <span className="flex items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`w-[3px] rounded-[1px] ${i <= bars ? "bg-ink" : "bg-line-2"}`} style={{ height: 3 + i * 2 }} />
        ))}
      </span>
      {risk}
    </span>
  );
}

export function OutcomeTag({ outcome }: { outcome: Outcome }) {
  const strong = outcome === "refuse" ? "bg-ink text-canvas" : outcome === "admit" ? "text-ink-3 border border-line-2" : "border border-ink text-ink";
  return <span className={`inline-flex h-[22px] items-center rounded-md px-2 text-[12px] font-medium whitespace-nowrap ${strong}`}>{OUTCOME_LABEL[outcome]}</span>;
}

export function Mono({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  // Only fall back to the default size when the caller did not set one, so two sizes never compete.
  const size = /(^|\s)text-\[\d/.test(className) ? "" : "text-[12.5px]";
  return <span className={`font-mono ${size} ${className}`}>{children}</span>;
}

export function Method({ method }: { method: string }) {
  return <span className="font-mono text-[11px] font-medium tracking-wide text-ink-3">{method}</span>;
}

export function LiveDot({ live = true }: { live?: boolean }) {
  return <span className={`inline-block size-1.5 shrink-0 rounded-full ${live ? "live-dot bg-ink" : "bg-ink-4"}`} />;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-5 py-14 text-center">
      <div className="text-[14px] font-medium">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-sm text-[13px] text-ink-3">{children}</div>}
    </div>
  );
}

/** Thin horizontal proportion bar. */
export function Meter({ value, max = 1, tone = "ink", className = "" }: { value: number; max?: number; tone?: "ink" | "grey"; className?: string }) {
  const w = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span className={`relative block h-1.5 overflow-hidden rounded-full bg-wash-2 ${className}`}>
      <span className={`absolute inset-y-0 left-0 rounded-full ${tone === "ink" ? "bg-ink" : "bg-ink-4"}`} style={{ width: `${w * 100}%` }} />
    </span>
  );
}

export function Segmented({ items, label }: { items: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex h-8 items-center rounded-lg border border-line bg-canvas p-0.5">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "true" : undefined}
          className={`flex h-full items-center rounded-md px-2.5 text-[12.5px] transition-colors ${
            item.active ? "bg-ink font-medium text-canvas" : "text-ink-2 hover:text-ink"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
