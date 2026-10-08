import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { OUTCOME_LONG, OUTCOME_PAST, OUTCOME_TONE, TIER_LABEL, VERDICT_LABEL, providerColor, type Tone } from "@/lib/format";
import type { Outcome, Risk, Tier, Verdict } from "@/lib/types";

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1240px] px-4 pt-5 pb-16 md:px-8 md:pt-8">{children}</div>;
}

/** Page title with the site's heading treatment. Put an italic serif accent in `title` with <em>. */
export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:mb-7 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2.5">{eyebrow}</div>}
        <h1 className="text-[28px] leading-[1.08] font-medium tracking-[-0.035em] break-words md:text-[34px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[14.5px] leading-[1.55] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A white panel ringed by a hairline (the site's .panel). */
export function Panel({
  title,
  description,
  action,
  children,
  className = "",
  flush = false,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** No inner padding below the head, for tables and lists that run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section className={`min-w-0 rounded-[14px] bg-sheet shadow-ring ${className}`}>
      {title && (
        <div className={`flex items-start justify-between gap-3 px-4 pt-3.5 ${flush ? "pb-2.5" : "pb-1"}`}>
          <div className="min-w-0">
            <h2 className="text-[14px] font-medium">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-ink-3">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={flush ? "" : "px-4 pt-2 pb-4"}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex shrink-0 items-center gap-1 pt-0.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink">
      {children}
      <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** A row of figures (the site's .tiles). */
export function Tiles({ children, cols = 4 }: { children: React.ReactNode; cols?: 3 | 4 | 5 }) {
  const grid = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" }[cols];
  return <div className={`grid grid-cols-2 gap-2.5 md:gap-3 ${grid}`}>{children}</div>;
}

export function Tile({ label, value, sub, mark }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; mark?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-[14px] bg-tile px-4 py-3.5 shadow-ring">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
        {mark}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 text-[28px] leading-none font-semibold tracking-[-0.03em] md:text-[30px]">{value}</div>
      {sub && <div className="mt-2 text-[12px] leading-snug text-ink-3">{sub}</div>}
    </div>
  );
}

const TONE: Record<Tone, string> = {
  ok: "bg-green-soft text-green",
  ask: "bg-amber-soft text-amber",
  no: "bg-red-soft text-red",
  mute: "bg-track text-ink-2",
};

/** Status pill: green allowed, amber asked, red blocked, grey for anything that is not a decision. */
export function Pill({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-block rounded-full px-[9px] py-[2px] text-[12px] leading-[1.45] font-medium whitespace-nowrap ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/** What the rules did with an action, past tense. Observe mode: the decision is logged, not enforced. */
export function OutcomePill({ outcome }: { outcome: Outcome }) {
  return (
    <Pill tone={OUTCOME_TONE[outcome]} title={OUTCOME_LONG[outcome]}>
      {OUTCOME_PAST[outcome]}
    </Pill>
  );
}

/** A session's status, as on the site's sessions table. */
export function StatusPill({ verdict, outcome }: { verdict: Verdict; outcome: Outcome | null }) {
  if (verdict === "human") return <Pill tone="mute">Person</Pill>;
  if (verdict === "unknown") return <Pill tone="mute">Undecided</Pill>;
  return outcome ? <OutcomePill outcome={outcome} /> : <Pill tone="ok">Allowed</Pill>;
}

/** Who is driving: an ink square for an agent, a hollow circle for a person, a dashed ring when undecided. */
export function Who({ verdict, children, className = "" }: { verdict: Verdict; children?: React.ReactNode; className?: string }) {
  const kind = verdict === "agent" ? "agent" : verdict === "human" ? "person" : "undecided";
  return (
    <span className={`who ${kind} max-w-full ${className}`}>
      <span className="min-w-0 truncate">{children ?? (verdict === "human" ? "A person" : VERDICT_LABEL[verdict])}</span>
    </span>
  );
}

export function TierTag({ tier, className = "text-[12px] text-ink-3" }: { tier: Tier; className?: string }) {
  return <span className={`whitespace-nowrap ${className}`}>{TIER_LABEL[tier]}</span>;
}

export function RiskTag({ risk }: { risk: Risk }) {
  const bars = { low: 1, medium: 2, high: 3, critical: 4 }[risk];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 capitalize" title={`${risk} risk`}>
      <span className="flex items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`w-[3px] rounded-[1px] ${i <= bars ? (risk === "critical" ? "bg-red" : "bg-ink-2") : "bg-bg-2"}`} style={{ height: 3 + i * 2 }} />
        ))}
      </span>
      {risk}
    </span>
  );
}

/** First letter of the agent in a rounded tile, coloured by its maker (the site's .avatar). */
export function Avatar({ name, provider, verdict = "agent", size = 36 }: { name: string; provider?: string | null; verdict?: Verdict; size?: number }) {
  const style = { width: size, height: size, borderRadius: size * 0.28, fontSize: size * 0.4 };
  if (verdict !== "agent") {
    return (
      <span
        className={`grid shrink-0 place-items-center font-medium ${verdict === "human" ? "bg-track text-ink-2" : "border-[1.5px] border-dashed border-ink-3 text-ink-3"}`}
        style={style}
        aria-hidden="true"
      >
        {verdict === "human" ? "P" : "?"}
      </span>
    );
  }
  return (
    <span className="grid shrink-0 place-items-center font-semibold text-white" style={{ ...style, background: providerColor(provider) }} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function Mono({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  // Only fall back to the default size when the caller did not set one, so two sizes never compete.
  const size = /(^|\s)text-\[\d/.test(className) ? "" : "text-[12.5px]";
  return <span className={`font-mono ${size} ${className}`}>{children}</span>;
}

export function Method({ method }: { method: string }) {
  return <span className="font-mono text-[10.5px] font-medium tracking-wide text-ink-3">{method}</span>;
}

export function LiveDot({ live = true, small = false }: { live?: boolean; small?: boolean }) {
  return <span className={`live ${small ? "sm" : ""} ${live ? "" : "off"}`} aria-hidden="true" />;
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-5 py-12 text-center">
      <div className="text-[14px] font-medium">{title}</div>
      {children && <div className="mx-auto mt-1.5 max-w-sm text-[13px] leading-[1.55] text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Share bar: agents green on a pale green track (the site's .share and .top-agents). */
export function ShareBar({ value, max = 1, className = "", tone = "agents" }: { value: number; max?: number; className?: string; tone?: "agents" | "people" | "muted" }) {
  const w = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const fill = { agents: "bg-agents", people: "bg-people", muted: "bg-undecided" }[tone];
  const track = tone === "agents" ? "bg-agents-track" : "bg-bg-2";
  return (
    <span className={`relative block h-[7px] overflow-hidden rounded-full ${track} ${className}`} aria-hidden="true">
      <span className={`absolute inset-y-0 left-0 rounded-full ${fill}`} style={{ width: `${w > 0 ? Math.max(w * 100, 2) : 0}%` }} />
    </span>
  );
}

/** Segmented control: grey track, white active pill (the site's .seg). */
export function Segmented({ items, label }: { items: { href: string; label: React.ReactNode; active: boolean; key?: string }[]; label: string }) {
  return (
    <nav aria-label={label} className="no-scrollbar inline-flex max-w-full overflow-x-auto rounded-full bg-track p-[3px]">
      {items.map((item) => (
        <Link
          key={item.key ?? item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "true" : undefined}
          className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] whitespace-nowrap transition-colors ${
            item.active ? "bg-sheet font-medium text-ink shadow-pill" : "text-ink-2 hover:text-ink"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** A count inside a segmented control. */
export function SegCount({ n, active }: { n: string; active: boolean }) {
  return <span className={`text-[12px] tabular ${active ? "text-ink-2" : "text-ink-3"}`}>{n}</span>;
}

/** Pill buttons, as on the site. */
export function buttonClass(kind: "dark" | "ghost" | "light" = "ghost", size: "sm" | "md" = "sm"): string {
  const base = `inline-flex items-center justify-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.98] ${
    size === "sm" ? "h-8 px-3.5 text-[13px]" : "h-10 px-5 text-[14px]"
  }`;
  if (kind === "dark") return `${base} border-transparent bg-ink text-white shadow-btn hover:bg-[#262a30]`;
  if (kind === "light") return `${base} border-line bg-sheet text-ink hover:shadow-sheet`;
  return `${base} border-line-2 bg-transparent text-ink hover:bg-sheet`;
}
