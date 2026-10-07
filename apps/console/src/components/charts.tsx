import Link from "next/link";

import { num } from "@/lib/format";
import type { Reason } from "@/lib/types";

/** Seven-day trend: past days in grey, today in ink. */
export function Sparkline({ values, width = 84, height = 24, label }: { values: number[]; width?: number; height?: number; label: string }) {
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (width - 4) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [2 + i * step, height - 2 - (v / max) * (height - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={`${label}: ${values.map(num).join(", ")}`} className="block overflow-visible">
      <path d={d} fill="none" stroke="var(--color-ink-4)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={2.5} fill="var(--color-ink)" />}
    </svg>
  );
}

export interface BarRow {
  key: string;
  label: React.ReactNode;
  sub?: React.ReactNode;
  value: number;
  display?: React.ReactNode;
  muted?: boolean;
  href?: string;
}

/** Ranked horizontal bars with the value at the tip. */
export function BarList({ rows, max }: { rows: BarRow[]; max?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 truncate text-[13.5px]">
                {r.label}
                {r.sub && <span className="ml-2 text-[12.5px] text-ink-3">{r.sub}</span>}
              </div>
              <div className="shrink-0 text-[13px] tabular">{r.display ?? num(r.value)}</div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-wash-2">
              <div className={`h-full rounded-full ${r.muted ? "bg-ink-4" : "bg-ink"}`} style={{ width: `${Math.max(r.value > 0 ? 1.5 : 0, (r.value / top) * 100)}%` }} />
            </div>
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className="block px-5 py-3 transition-colors hover:bg-wash">
                {inner}
              </Link>
            ) : (
              <div className="px-5 py-3">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Evidence behind a verdict as diverging bars: right is toward agent, left toward person. */
export function ReasonBars({ reasons }: { reasons: Reason[] }) {
  const max = Math.max(...reasons.map((r) => Math.abs(r.weight)), 1);
  return (
    <ul className="space-y-3">
      {reasons.map((r) => {
        const w = (Math.abs(r.weight) / max) * 50;
        const agent = r.weight >= 0;
        return (
          <li key={r.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-[13px]">{r.label}</span>
              <span className="shrink-0 text-[12px] text-ink-3 tabular">
                {r.weight > 0 ? "+" : r.weight < 0 ? "−" : ""}
                {Math.abs(r.weight).toFixed(1)}
              </span>
            </div>
            <div className="relative mt-1.5 h-1.5 rounded-full bg-wash-2" aria-hidden="true">
              <span className="absolute inset-y-[-2px] left-1/2 w-px bg-line-2" />
              <span
                className={`absolute inset-y-0 rounded-full ${agent ? "bg-ink" : "bg-ink-4"}`}
                style={agent ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
              />
            </div>
            {(r.detail || r.robustness) && (
              <div className="mt-1 flex gap-2 text-[11.5px] text-ink-3">
                {r.detail && <span className="font-mono">{r.detail}</span>}
                {r.detail && r.robustness && <span className="text-ink-4">·</span>}
                {r.robustness && <span className="capitalize">{r.robustness}</span>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Two thin bars comparing person-hours with agent-hours on the same logins. */
export function HoursBars({ human, agent, max }: { human: number; agent: number; max: number }) {
  const pct = (v: number) => `${Math.max(v > 0 ? 2 : 0, (v / Math.max(max, 0.01)) * 100)}%`;
  return (
    <div className="w-full space-y-1" aria-hidden="true">
      <div className="h-1.5 rounded-full bg-wash-2">
        <div className="h-full rounded-full bg-ink-4" style={{ width: pct(human) }} />
      </div>
      <div className="h-1.5 rounded-full bg-wash-2">
        <div className="h-full rounded-full bg-ink" style={{ width: pct(agent) }} />
      </div>
    </div>
  );
}
