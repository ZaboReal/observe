import Link from "next/link";
import type { Metadata } from "next";
import { Download } from "lucide-react";

import { SelectFilter, ToggleFilter } from "@/components/filters";
import { LiveToggle } from "@/components/live";
import { Time } from "@/components/time";
import { Card, Empty, Method, Mono, OutcomeTag, Page, PageHeader, RiskTag, Segmented, TierTag } from "@/components/ui";
import { num } from "@/lib/format";
import { OUTCOME_LABEL } from "@/lib/policy";
import { EXPORT_CAP, RANGES, entryLog, parseRange, seenDrivers } from "@/lib/queries";
import type { Outcome } from "@/lib/types";

export const metadata: Metadata = { title: "Entry log" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const OUTCOMES: Outcome[] = ["admit", "slow", "request_visa", "ask", "refuse"];
const SHOWN = 100;

function href(params: Params, changes: Record<string, string | null>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string") next.set(k, v);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `/log?${qs}` : "/log";
}

export default async function LogPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const range = parseRange(one(params.range));
  const o = one(params.outcome);
  const outcome = OUTCOMES.includes(o as Outcome) ? (o as Outcome) : undefined;
  const { lines, counts } = entryLog({
    range,
    sensitiveOnly: one(params.sensitive) === "1",
    driverId: one(params.driver),
    outcome,
    limit: SHOWN,
  });
  const total = outcome ? counts[outcome] : counts.total;
  const exportParams: Record<string, string> = { range };
  for (const k of ["sensitive", "driver", "outcome"]) {
    const v = one(params[k]);
    if (v) exportParams[k] = v;
  }

  return (
    <Page>
      <PageHeader
        title="Entry log"
        description="Every action an agent took, who it acted for, and what your policy would have decided."
        actions={
          <>
            <Segmented label="Time range" items={RANGES.map((x) => ({ href: href(params, { range: x.id }), label: x.id, active: x.id === range }))} />
            <LiveToggle />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ToggleFilter name="sensitive" label="Sensitive only" />
        <SelectFilter
          name="driver"
          label="All agents"
          options={seenDrivers()}
        />
        <div className="ml-auto">
          <a
            href={`/api/v1/entries?${new URLSearchParams({ ...exportParams, format: "csv" }).toString()}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13px] text-ink-2 transition-colors hover:border-line-2 hover:text-ink"
          >
            <Download size={14} /> Export CSV
          </a>
        </div>
      </div>

      <Card>
        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-3" role="tablist" aria-label="Decision">
          {[{ id: undefined, label: "All decisions", n: counts.total }, ...OUTCOMES.map((x) => ({ id: x, label: OUTCOME_LABEL[x], n: counts[x] }))].map((t) => {
            const active = t.id === outcome;
            return (
              <Link
                key={t.label}
                role="tab"
                aria-selected={active}
                href={href(params, { outcome: t.id ?? null })}
                scroll={false}
                className={`relative flex h-11 shrink-0 items-center gap-2 px-2.5 text-[13px] ${active ? "font-medium text-ink" : "text-ink-3 hover:text-ink"}`}
              >
                {t.label}
                <span className={`tabular ${active ? "text-ink-2" : "text-ink-4"}`}>{num(t.n)}</span>
                {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ink" />}
              </Link>
            );
          })}
        </div>

        {lines.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-line text-[12px] text-ink-3">
                  <th className="py-2.5 pr-3 pl-5 font-normal">Time</th>
                  <th className="px-3 py-2.5 font-normal">Agent</th>
                  <th className="px-3 py-2.5 font-normal">Acting for</th>
                  <th className="px-3 py-2.5 font-normal">Action</th>
                  <th className="px-3 py-2.5 font-normal">Risk</th>
                  <th className="py-2.5 pr-5 pl-3 text-right font-normal">Would decide</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0 hover:bg-wash">
                    <td className="py-2.5 pr-3 pl-5 align-top">
                      <Link href={`/sessions/${l.sessionId}`} className="text-[12.5px] text-ink-2 tabular hover:underline">
                        <Time t={l.ts} format="seconds" />
                      </Link>
                      <Mono className="block text-[11px] text-ink-4">{l.id}</Mono>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="text-[13px]">{l.driver}</div>
                      <TierTag tier={l.tier} />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="max-w-[240px] truncate text-[13px]">{l.email}</div>
                      <div className="text-[12px] text-ink-3">{l.account}</div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="text-[13px]">{l.action.label}</div>
                      <div className="flex items-center gap-1.5">
                        <Method method={l.action.method} />
                        <Mono className="text-[11.5px] text-ink-3">{l.action.path}</Mono>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <RiskTag risk={l.action.risk} />
                    </td>
                    <td className="py-2.5 pr-5 pl-3 text-right align-top">
                      <OutcomeTag outcome={l.outcome} />
                      <Mono className="mt-1 block text-[11px] text-ink-4">{l.policy}</Mono>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No entries">No agent actions match these filters in this range.</Empty>
        )}
        {lines.length >= SHOWN && (
          <div className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3">
            Showing the {SHOWN} most recent of {num(total)}.{" "}
            {total > EXPORT_CAP ? `Export includes the most recent ${num(EXPORT_CAP)}.` : "Export includes them all."}
          </div>
        )}
      </Card>
    </Page>
  );
}
