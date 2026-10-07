import { duration } from "@/lib/format";
import type { SessionEvent } from "@/lib/types";

import { Time } from "./time";

const RISK_HEIGHT = { low: 10, medium: 18, high: 26, critical: 30 } as const;

/**
 * Session replay as an event plot: who drove each stretch, every action as a tick (taller = more
 * sensitive), and the moment an agent took over. Positions are percentages, so it needs no measuring.
 */
export function SessionTrack({
  events,
  startedAt,
  endAt,
  handoffAt,
  driverName,
}: {
  events: SessionEvent[];
  startedAt: number;
  endAt: number;
  handoffAt: number | null;
  driverName: string | null;
}) {
  const span = Math.max(1, endAt - startedAt);
  const at = (t: number) => `${Math.min(100, Math.max(0, (t / span) * 100))}%`;

  // Contiguous stretches driven by the same party.
  const runs: { from: number; to: number; driver: SessionEvent["driver"] }[] = [];
  for (const e of events) {
    const last = runs[runs.length - 1];
    if (last && last.driver === e.driver) continue;
    if (last) last.to = e.t;
    runs.push({ from: e.t, to: span, driver: e.driver });
  }

  // Page labels, skipping ones that would collide with the previous label. Phones keep fewer.
  const pages: { t: number; route: string; narrow: boolean }[] = [];
  let lastNarrow = -Infinity;
  for (const e of events) {
    if (e.type !== "page") continue;
    const prev = pages[pages.length - 1];
    if (prev && (e.t - prev.t) / span < 0.12) continue;
    const narrow = (e.t - lastNarrow) / span >= 0.34;
    if (narrow) lastNarrow = e.t;
    pages.push({ t: e.t, route: e.route, narrow });
  }

  const ticks = [0.25, 0.5, 0.75].map((f) => startedAt + f * span);

  return (
    <div>
      <div className="relative h-[146px]">
        {/* Pages lane */}
        <div className="absolute inset-x-0 top-0 h-5">
          {pages.map((p) => (
            <span
              key={`${p.t}-${p.route}`}
              className={`absolute top-0 truncate font-mono text-[11px] text-ink-3 max-sm:max-w-[32%] sm:max-w-[22%] ${p.narrow ? "" : "max-sm:hidden"}`}
              style={{ left: at(p.t) }}
            >
              <span className="mr-1 inline-block h-2 w-px translate-y-[1px] bg-ink-4" />
              {p.route}
            </span>
          ))}
        </div>

        {/* Actions lane */}
        <div className="absolute inset-x-0 top-6 h-[44px] border-b border-line">
          {events
            .filter((e) => e.type !== "page")
            .map((e, i) => {
              const h = e.action ? RISK_HEIGHT[e.action.risk] : 12;
              const label = e.action ? `${e.action.label} · ${e.action.method} ${e.action.path}` : (e.input ?? "input");
              return (
                <span
                  key={`${e.t}-${i}`}
                  title={`+${duration(e.t)} · ${e.driver} · ${label}`}
                  className={`absolute bottom-0 w-[2px] -translate-x-1/2 rounded-t-[1px] ${e.driver === "agent" ? "bg-ink" : e.driver === "human" ? "bg-ink-4" : "bg-line-2"}`}
                  style={{ left: at(e.t), height: h }}
                />
              );
            })}
        </div>

        {/* Driver lane */}
        <div className="absolute inset-x-0 top-[84px] h-3 overflow-hidden rounded-full bg-wash-2">
          {runs.map((r) => (
            <span
              key={r.from}
              className={`absolute inset-y-0 ${r.driver === "agent" ? "bg-ink" : r.driver === "human" ? "bg-human" : "bg-[repeating-linear-gradient(45deg,var(--color-unknown)_0_3px,var(--color-line-2)_3px_4px)]"}`}
              style={{ left: at(r.from), width: `calc(${at(r.to)} - ${at(r.from)} - 2px)` }}
            />
          ))}
        </div>

        {/* Handoff marker */}
        {handoffAt !== null && (
          <div className="absolute top-5 h-[94px] w-px border-l border-dashed border-ink" style={{ left: at(handoffAt) }}>
            <span className={`absolute -bottom-0.5 text-[11.5px] font-medium whitespace-nowrap ${handoffAt / span > 0.6 ? "right-1.5" : "left-1.5"}`}>
              {driverName ?? "Agent"} took over · <Time t={startedAt + handoffAt} />
            </span>
          </div>
        )}

        {/* Axis */}
        <div className="absolute inset-x-0 bottom-0 h-4 text-[11px] text-ink-4">
          <span className="absolute left-0">
            <Time t={startedAt} />
          </span>
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 max-sm:hidden" style={{ left: at(t - startedAt) }}>
              +{duration(t - startedAt)}
            </span>
          ))}
          <span className="absolute right-0">
            <Time t={endAt} />
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded-full bg-human" /> Person driving
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded-full bg-ink" /> Agent driving
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex items-end gap-[3px]">
            <span className="inline-block h-[6px] w-[2px] bg-ink-3" />
            <span className="inline-block h-[10px] w-[2px] bg-ink-3" />
            <span className="inline-block h-[14px] w-[2px] bg-ink-3" />
          </span>
          Action, taller is more sensitive
        </span>
      </div>
    </div>
  );
}
