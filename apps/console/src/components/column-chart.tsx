"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { num } from "@/lib/format";
import type { SeriesPoint } from "@/lib/queries";
import type { Verdict } from "@/lib/types";

/**
 * Stacked columns of sessions over time, as on the site's hero dashboard: people (blue) on the baseline, agents
 * (green) above, and sessions not decided yet in neutral grey on top, so an undecided session never reads as a person.
 */

export const SERIES_LABEL: Record<Verdict, string> = { human: "People", agent: "Agents", unknown: "Undecided" };
export const SERIES_COLOR: Record<Verdict, string> = { human: "var(--color-people)", agent: "var(--color-agents)", unknown: "var(--color-undecided)" };
const ORDER: Verdict[] = ["human", "agent", "unknown"];

const PAD = { top: 12, right: 4, bottom: 24, left: 36 };
const GAP = 2;

/** Round tick step so about three or four gridlines land on clean whole numbers (the data are counts). */
function niceStep(max: number): number {
  const raw = Math.max(max, 1) / 3;
  const exp = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) {
    const step = m * exp;
    if (step >= raw && Number.isInteger(step)) return Math.max(1, step);
  }
  return 10 * exp;
}

/** Clock-aligned ticks in the viewer's time zone. */
function timeTicks(from: number, to: number): number[] {
  const span = to - from;
  const H = 3_600_000;
  const step = span <= 2 * H ? 15 * 60_000 : span <= 26 * H ? 6 * H : 24 * H;
  const first = new Date(from);
  if (step >= 24 * H) first.setHours(0, 0, 0, 0);
  else if (step >= H) first.setMinutes(0, 0, 0);
  else first.setSeconds(0, 0);
  let t = first.getTime();
  if (step < 24 * H) {
    const d = new Date(t);
    const unit = step >= H ? d.getHours() * H : d.getMinutes() * 60_000;
    t -= unit % step;
  }
  const ticks: number[] = [];
  for (; t <= to; t += step) if (t >= from + span * 0.03 && t <= to - span * 0.06) ticks.push(t);
  return ticks;
}

function tickLabel(t: number, span: number): string {
  const d = new Date(t);
  if (span > 2 * 86_400_000) return d.toLocaleDateString("en-US", { weekday: "short" });
  if (span <= 2 * 3_600_000) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleTimeString("en-US", { hour: "numeric" });
}

function rangeLabel(t: number, bucket: number): string {
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const a = new Date(t);
  const b = new Date(t + bucket);
  const time = `${a.toLocaleTimeString("en-US", opts)} – ${b.toLocaleTimeString("en-US", opts)}`;
  return bucket >= 4 * 3_600_000 || Date.now() - t > 20 * 3_600_000 ? `${a.toLocaleDateString("en-US", { weekday: "short" })} ${time}` : time;
}

export function ChartLegend({ series }: { series: Verdict[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] whitespace-nowrap text-ink-2">
      {series.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <i className="inline-block size-[9px] rounded-[2px]" style={{ background: SERIES_COLOR[k] }} />
          {SERIES_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

export function ColumnChart({
  points,
  bucket,
  from,
  to,
  series = ORDER,
  height = 220,
  caption,
}: {
  points: SeriesPoint[];
  bucket: number;
  from: number;
  to: number;
  series?: Verdict[];
  height?: number;
  caption: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [grow, setGrow] = useState(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Columns grow in the first time the chart appears; refreshes after that just update the numbers.
  useEffect(() => {
    const id = setTimeout(() => setGrow(false), 1800);
    return () => clearTimeout(id);
  }, []);

  const w = Math.max(0, width - PAD.left - PAD.right);
  const h = height - PAD.top - PAD.bottom;
  const totals = points.map((p) => series.reduce((n, k) => n + p[k], 0));
  const peak = Math.max(...totals, 0);
  const step = niceStep(peak);
  const max = step * Math.max(1, Math.ceil(peak / step));
  const x = (t: number) => PAD.left + ((t - from) / (to - from)) * w;
  const y = (v: number) => PAD.top + h - (v / max) * h;
  const slot = points.length ? w / points.length : w;
  const bw = Math.max(2, Math.min(18, slot * 0.62));
  const yTicks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  // Leave room for the "now" label at the right edge.
  const xTicks = width ? timeTicks(from, to).filter((t) => x(t) < PAD.left + w - 44) : [];

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setHover(null);
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const d = e.key === "ArrowLeft" ? -1 : 1;
    setHover((i) => Math.max(0, Math.min(points.length - 1, (i ?? points.length) + d)));
  };

  const hp = hover !== null ? points[hover] : undefined;
  const tipLeft = hover !== null ? Math.min(Math.max(x(points[hover]!.t) + slot / 2, 80), Math.max(80, width - 80)) : 0;

  return (
    <div
      ref={ref}
      className={`relative rounded-md select-none ${grow ? "chart-grow" : ""}`}
      style={{ height }}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKey}
      onBlur={() => setHover(null)}
      tabIndex={0}
      role="group"
      aria-label={`${caption}. Use the arrow keys to read each column.`}
    >
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible" aria-hidden="true">
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + w} y1={y(v)} y2={y(v)} stroke="var(--color-grid)" />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-ink-3 font-mono text-[10.5px]">
                {num(v)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={height - 6} textAnchor="middle" className="fill-ink-3 font-mono text-[10.5px]">
              {tickLabel(t, to - from)}
            </text>
          ))}
          <text x={PAD.left + w} y={height - 6} textAnchor="end" className="fill-ink-3 font-mono text-[10.5px]">
            now
          </text>

          {points.map((p, i) => {
            const cx = x(p.t) + (slot - bw) / 2;
            const segs: { k: Verdict; top: number; bottom: number }[] = [];
            let acc = 0;
            for (const k of series) {
              const v = p[k];
              if (!v) continue;
              const bottom = y(acc) - (segs.length ? GAP : 0);
              acc += v;
              const top = y(acc);
              if (bottom - top > 0.5) segs.push({ k, top, bottom });
            }
            const dim = hover !== null && hover !== i;
            return (
              <g key={p.t} style={{ opacity: dim ? 0.4 : 1, transition: "opacity 0.15s ease" }} onPointerEnter={() => setHover(i)}>
                {segs.map((s, j) => {
                  const last = j === segs.length - 1;
                  const r = last ? Math.min(4, bw / 2, s.bottom - s.top) : 0;
                  const d = r
                    ? `M${cx} ${s.bottom}V${s.top + r}Q${cx} ${s.top} ${cx + r} ${s.top}H${cx + bw - r}Q${cx + bw} ${s.top} ${cx + bw} ${s.top + r}V${s.bottom}Z`
                    : `M${cx} ${s.bottom}V${s.top}H${cx + bw}V${s.bottom}Z`;
                  return <path key={s.k} className="seg-bar" style={{ ["--i" as string]: i }} d={d} fill={SERIES_COLOR[s.k]} />;
                })}
                <rect x={x(p.t)} y={PAD.top} width={slot} height={h} fill="transparent" />
              </g>
            );
          })}
        </svg>
      )}

      {peak === 0 && width > 0 && <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-[13px] text-ink-3">No sessions in this range yet</div>}

      {hp && hover !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 min-w-[150px] -translate-x-1/2 -translate-y-full rounded-[10px] bg-ink px-3 py-2 text-[12px] leading-[1.5] whitespace-nowrap text-white shadow-sheet"
          style={{ left: tipLeft, top: Math.max(0, y(totals[hover]!) - 8) }}
        >
          <div className="mb-0.5 text-[11.5px] text-[#b5bac2]">{rangeLabel(hp.t, bucket)}</div>
          {[...series].reverse().map((k) => (
            <div key={k} className="flex items-center justify-between gap-5">
              <span className="flex items-center gap-2 text-[#b5bac2]">
                <i className="inline-block h-[3px] w-2.5 rounded-full" style={{ background: SERIES_COLOR[k] === "var(--color-agents)" ? "#3fb43f" : SERIES_COLOR[k] }} />
                {SERIES_LABEL[k]}
              </span>
              <b className="font-medium tabular">{num(hp[k])}</b>
            </div>
          ))}
        </div>
      )}

      {width > 0 && (
        // A table is as wide as its content whatever its own width, so the visually-hidden box wraps it.
        <div className="sr-only">
          <table>
            <caption>{caption}</caption>
            <thead>
              <tr>
                <th>From</th>
                {series.map((k) => (
                  <th key={k}>{SERIES_LABEL[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.t}>
                  <td>{rangeLabel(p.t, bucket)}</td>
                  {series.map((k) => (
                    <td key={k}>{p[k]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
