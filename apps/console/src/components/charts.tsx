import Link from "next/link";

import { num, pct } from "@/lib/format";
import type { Reason } from "@/lib/types";

import { ShareBar } from "./ui";

/** Seven-day trend: the line in grey, today as a green dot. */
export function Sparkline({ values, width = 84, height = 24, label }: { values: number[]; width?: number; height?: number; label: string }) {
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (width - 8) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [4 + i * step, height - 4 - (v / max) * (height - 8)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={`${label}: ${values.map(num).join(", ")}`} className="block overflow-visible">
      <path d={d} fill="none" stroke="var(--color-ink-3)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={3.5} fill="var(--color-agents)" stroke="var(--color-sheet)" strokeWidth={2} />}
    </svg>
  );
}

export interface ShareRow {
  key: string;
  label: React.ReactNode;
  sub?: React.ReactNode;
  /** 0..1 */
  share: number;
  display?: React.ReactNode;
  href?: string;
}

/** Ranked share bars with the value at the end (the site's "Top agents"). */
export function ShareList({ rows, max }: { rows: ShareRow[]; max?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.share), 0.0001);
  return (
    <ul className="grid gap-0.5">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="min-w-0 truncate text-[13.5px]">
              {r.label}
              {r.sub && <span className="ml-2 text-[12px] text-ink-3">{r.sub}</span>}
            </span>
            <ShareBar value={r.share} max={top} />
            <b className="text-right text-[13px] font-medium tabular">{r.display ?? pct(r.share, 1)}</b>
          </>
        );
        const cls = "grid grid-cols-[minmax(0,1fr)_minmax(56px,30%)_44px] items-center gap-3 rounded-lg px-2 py-[7px]";
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className={`${cls} -mx-0 transition-colors hover:bg-tile`}>
                {inner}
              </Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Evidence behind a verdict as diverging bars: right (green) toward an agent, left (blue) toward a person. */
export function ReasonBars({ reasons }: { reasons: Reason[] }) {
  const max = Math.max(...reasons.map((r) => Math.abs(r.weight)), 1);
  return (
    <ul className="space-y-3.5">
      {reasons.map((r) => {
        const w = (Math.abs(r.weight) / max) * 50;
        const agent = r.weight >= 0;
        return (
          <li key={r.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-[13px]">{r.label}</span>
              <span className="shrink-0 font-mono text-[11.5px] text-ink-3 tabular">
                {r.weight > 0 ? "+" : r.weight < 0 ? "−" : ""}
                {Math.abs(r.weight).toFixed(1)}
              </span>
            </div>
            <div className="relative mt-1.5 h-[7px] rounded-full bg-bg-2" aria-hidden="true">
              <span className="absolute inset-y-[-3px] left-1/2 w-px bg-line-2" />
              <span className={`absolute inset-y-0 rounded-full ${agent ? "bg-agents" : "bg-people"}`} style={agent ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
            </div>
            {(r.detail || r.robustness) && (
              <div className="mt-1 flex flex-wrap gap-x-2 text-[11.5px] text-ink-3">
                {r.detail && <span className="font-mono break-all">{r.detail}</span>}
                {r.detail && r.robustness && <span>·</span>}
                {r.robustness && <span>{r.robustness} robustness</span>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Two thin bars comparing person-hours (blue) with agent-hours (green) on the same logins. */
export function HoursBars({ human, agent, max }: { human: number; agent: number; max: number }) {
  const w = (v: number) => `${Math.max(v > 0 ? 2 : 0, (v / Math.max(max, 0.01)) * 100)}%`;
  return (
    <div className="w-full space-y-[3px]" aria-hidden="true">
      <div className="h-[6px] rounded-full bg-bg-2">
        <div className="h-full rounded-full bg-people" style={{ width: w(human) }} />
      </div>
      <div className="h-[6px] rounded-full bg-bg-2">
        <div className="h-full rounded-full bg-agents" style={{ width: w(agent) }} />
      </div>
    </div>
  );
}
