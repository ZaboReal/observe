"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

import { num } from "@/lib/format";
import type { SeriesPoint } from "@/lib/queries";
import type { Verdict } from "@/lib/types";

const LABEL: Record<Verdict, string> = { agent: "Agent", human: "Human", unknown: "Unknown" };

/** Stacked bottom to top. Agents sit on the baseline so their trend reads against a flat edge. */
const ORDER: Verdict[] = ["agent", "human", "unknown"];

const PAD = { top: 14, right: 72, bottom: 26, left: 40 };

/** Round tick step so about four gridlines land on clean whole numbers (the data are counts). */
function niceStep(max: number): number {
  const raw = Math.max(max, 1) / 4;
  const exp = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) {
    const step = m * exp;
    if (step >= raw && Number.isInteger(step)) return Math.max(1, step);
  }
  return 10 * exp;
}

function timeTicks(from: number, to: number): number[] {
  const span = to - from;
  const H = 3_600_000;
  const step = span <= 2 * H ? 10 * 60_000 : span <= 26 * H ? 4 * H : 24 * H;
  const ticks: number[] = [];
  const first = new Date(from);
  if (step >= 24 * H) first.setHours(0, 0, 0, 0);
  else if (step >= H) first.setMinutes(0, 0, 0);
  else first.setSeconds(0, 0);
  let t = first.getTime();
  // Snap to the step in local time.
  if (step < 24 * H) {
    const d = new Date(t);
    const unit = step >= H ? d.getHours() * H : d.getMinutes() * 60_000;
    t -= unit % step;
  }
  for (; t <= to; t += step) if (t >= from + span * 0.04 && t <= to - span * 0.04) ticks.push(t);
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
  if (bucket >= 4 * 3_600_000) return `${a.toLocaleDateString("en-US", { weekday: "short" })} ${a.toLocaleTimeString("en-US", opts)} – ${b.toLocaleTimeString("en-US", opts)}`;
  return `${a.toLocaleTimeString("en-US", opts)} – ${b.toLocaleTimeString("en-US", opts)}`;
}

export function AreaChart({
  points,
  bucket,
  from,
  to,
  series = ORDER,
  height = 260,
  unit = "sessions",
}: {
  points: SeriesPoint[];
  bucket: number;
  from: number;
  to: number;
  series?: Verdict[];
  height?: number;
  unit?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const hatch = `hatch-${useId().replace(/:/g, "")}`;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const single = series.length === 1;
  const pad = { ...PAD, right: single ? 16 : PAD.right };
  const w = Math.max(0, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;
  const totals = points.map((p) => series.reduce((n, k) => n + p[k], 0));
  const step = niceStep(Math.max(...totals, 1));
  const max = step * Math.ceil(Math.max(...totals, 1) / step);
  const x = (t: number) => pad.left + ((t - from) / (to - from)) * w;
  const y = (v: number) => pad.top + h - (v / max) * h;
  const mid = (i: number) => x(points[i]!.t + bucket / 2);

  // Cumulative tops for each layer.
  const stacks: number[][] = [];
  points.forEach((p, i) => {
    let acc = 0;
    series.forEach((k, j) => {
      acc += p[k];
      (stacks[j] ??= [])[i] = acc;
    });
  });

  const line = (vals: number[]) => {
    if (!points.length) return "";
    const pts = vals.map((v, i) => `${mid(i).toFixed(1)},${y(v).toFixed(1)}`);
    // Extend flat to both edges of the range.
    return `M${x(from).toFixed(1)},${y(vals[0]!).toFixed(1)} L${pts.join(" L")} L${x(to).toFixed(1)},${y(vals[vals.length - 1]!).toFixed(1)}`;
  };
  const area = (top: number[], bottom: number[] | null) => {
    const upper = line(top);
    const lower = bottom
      ? [...bottom.map((v, i) => [mid(i), y(v)] as const)].reverse()
      : [];
    const base = bottom
      ? `L${x(to).toFixed(1)},${y(bottom[bottom.length - 1]!).toFixed(1)} ${lower.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join(" ")} L${x(from).toFixed(1)},${y(bottom[0]!).toFixed(1)}`
      : `L${x(to).toFixed(1)},${y(0)} L${x(from).toFixed(1)},${y(0)}`;
    return `${upper} ${base} Z`;
  };

  const yTicks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  // Keep tick labels clear of the "now" label at the right edge.
  const xTicks = timeTicks(from, to).filter((t) => x(t) < pad.left + w - 44);
  const fill: Record<Verdict, string> = { agent: "var(--color-agent)", human: "var(--color-human)", unknown: `url(#${hatch})` };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < pad.left || px > pad.left + w) return setHover(null);
    const t = from + ((px - pad.left) / w) * (to - from);
    setHover(Math.max(0, Math.min(points.length - 1, Math.floor((t - points[0]!.t) / bucket))));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.key === "ArrowLeft" ? -1 : 1;
    setHover((i) => Math.max(0, Math.min(points.length - 1, (i ?? points.length) + step)));
  };

  const hp = hover !== null ? points[hover] : null;
  const last = points.length - 1;
  const endLabels = !single && last >= 0
    ? series
        .map((k, j) => {
          const lower = j === 0 ? 0 : stacks[j - 1]![last]!;
          const upper = stacks[j]![last]!;
          return { k, y: (y(lower) + y(upper)) / 2, room: y(lower) - y(upper) };
        })
        .filter((l, i, all) => l.room >= 4 && all.slice(0, i).every((o) => Math.abs(o.y - l.y) > 14))
    : [];

  return (
    <div
      ref={ref}
      className="relative select-none outline-none"
      style={{ height }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKey}
      onBlur={() => setHover(null)}
      tabIndex={0}
      role="img"
      aria-label={`${single ? LABEL[series[0]!] : "Human, agent and unknown"} ${unit} over time. Use the arrow keys to read values.`}
    >
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          <defs>
            <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--color-unknown)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#a9a9a9" strokeWidth="1.2" />
            </pattern>
          </defs>

          {yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.left} x2={pad.left + w} y1={y(v)} y2={y(v)} stroke="var(--color-line)" />
              <text x={pad.left - 10} y={y(v)} dy="0.32em" textAnchor="end" className="fill-ink-4 text-[11px] tabular">
                {num(v)}
              </text>
            </g>
          ))}

          {series.map((k, j) => (
            <path key={k} d={area(stacks[j]!, j === 0 ? null : stacks[j - 1]!)} fill={fill[k]} />
          ))}
          {/* 2px surface gap between layers instead of outlines. */}
          {series.slice(0, -1).map((k, j) => (
            <path key={`gap-${k}`} d={line(stacks[j]!)} fill="none" stroke="var(--color-canvas)" strokeWidth={2} strokeLinejoin="round" />
          ))}
          {single && <path d={line(stacks[0]!)} fill="none" stroke="var(--color-ink)" strokeWidth={2} strokeLinejoin="round" />}

          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={height - 6} textAnchor="middle" className="fill-ink-4 text-[11px]">
              {tickLabel(t, to - from)}
            </text>
          ))}
          <text x={pad.left + w} y={height - 6} textAnchor="end" className="fill-ink-4 text-[11px]">
            now
          </text>

          {endLabels.map((l) => (
            <text key={l.k} x={pad.left + w + 10} y={l.y} dy="0.32em" className="fill-ink-2 text-[11.5px]">
              {LABEL[l.k]}
            </text>
          ))}

          {hp && hover !== null && (
            <g pointerEvents="none">
              <line x1={mid(hover)} x2={mid(hover)} y1={pad.top} y2={pad.top + h} stroke="var(--color-ink)" strokeWidth={1} />
              {series.map((k, j) => (
                <circle key={k} cx={mid(hover)} cy={y(stacks[j]![hover]!)} r={4} fill={k === "agent" ? "var(--color-ink)" : "var(--color-canvas)"} stroke={k === "agent" ? "var(--color-canvas)" : "var(--color-ink-3)"} strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
      )}

      {hp && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-[168px] rounded-lg border border-line bg-canvas px-3 py-2.5 shadow-[0_4px_16px_rgb(0_0_0/0.06)]"
          style={{
            top: pad.top,
            left: mid(hover) > width - 200 ? mid(hover) - 180 : mid(hover) + 12,
          }}
        >
          <div className="mb-1.5 text-[11.5px] text-ink-3">{rangeLabel(hp.t, bucket)}</div>
          {[...series].reverse().map((k) => (
            <div key={k} className="flex items-center justify-between gap-6 py-0.5 text-[12.5px]">
              <span className="flex items-center gap-2 text-ink-3">
                <span className={`inline-block h-[2px] w-3 rounded ${k === "agent" ? "bg-ink" : k === "human" ? "bg-ink-4" : "border-t border-dashed border-ink-3"}`} />
                {LABEL[k]}
              </span>
              <span className="font-medium tabular">{num(hp[k])}</span>
            </div>
          ))}
          {!single && (
            <div className="mt-1 flex justify-between border-t border-line pt-1.5 text-[12.5px]">
              <span className="text-ink-3">Total</span>
              <span className="font-medium tabular">{num(totals[hover]!)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
