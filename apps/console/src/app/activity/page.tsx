import Link from "next/link";
import type { Metadata } from "next";
import { Download } from "lucide-react";

import { SelectFilter, ToggleFilter } from "@/components/filters";
import { LiveToggle } from "@/components/live";
import { Time } from "@/components/time";
import { Empty, Method, Mono, OutcomePill, Page, PageHeader, Panel, RiskTag, SegCount, Segmented, buttonClass } from "@/components/ui";
import { OUTCOME_LONG, TIER_LABEL, num, personOf } from "@/lib/format";
import { formatPrice, formatTotal } from "@/lib/money";
import { EXPORT_CAP, RANGES, entryLog, parseRange, seenDrivers } from "@/lib/queries";
import { currentSite } from "@/lib/current-site";
import { syncStore } from "@/lib/sync";
import type { Outcome } from "@/lib/types";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const OUTCOMES: Outcome[] = ["admit", "slow", "request_access", "ask", "refuse"];
const SHOWN = 100;

function href(params: Params, changes: Record<string, string | null>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string") next.set(k, v);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `/activity?${qs}` : "/activity";
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Params> }) {
  await syncStore();
  const site = await currentSite();
  const params = await searchParams;
  const range = parseRange(one(params.range));
  const o = one(params.outcome);
  const outcome = OUTCOMES.includes(o as Outcome) ? (o as Outcome) : undefined;
  const { lines, counts, billed } = entryLog({ siteId: site.id,
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
        eyebrow="Activity"
        title={
          <>
            Every agent action, <em>on record</em>
          </>
        }
        description={`What each agent did, who it acted for, and what your rules decided. Observe mode: decisions are logged, nothing is blocked.${billed > 0 ? ` Agents were billed ${formatTotal(billed)} in this range.` : ""}`}
        actions={
          <>
            <Segmented label="Time range" items={RANGES.map((x) => ({ href: href(params, { range: x.id }), label: x.id, active: x.id === range }))} />
            <LiveToggle />
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          label="Outcome"
          items={[{ id: undefined, label: "All", n: counts.total }, ...OUTCOMES.map((x) => ({ id: x, label: OUTCOME_LONG[x], n: counts[x] }))].map((t) => ({
            key: t.label,
            href: href(params, { outcome: t.id ?? null }),
            active: t.id === outcome,
            label: (
              <>
                {t.label} <SegCount n={num(t.n)} active={t.id === outcome} />
              </>
            ),
          }))}
        />
        <div className="flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto">
          <ToggleFilter name="sensitive" label="Sensitive only" />
          <SelectFilter name="driver" label="All agents" options={seenDrivers(site.id)} />
          <a href={`/api/v1/entries?${new URLSearchParams({ ...exportParams, format: "csv" }).toString()}`} className={buttonClass("dark")}>
            <Download size={14} /> Export CSV
          </a>
        </div>
      </div>

      <Panel flush>
        {lines.length ? (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[900px] text-[13px]">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Agent</th>
                  <th>Acting for</th>
                  <th>Action</th>
                  <th>Risk</th>
                  <th className="text-right">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const person = personOf(l.email);
                  return (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap">
                        <Link href={`/sessions/${l.sessionId}`} className="font-mono text-[12px] text-ink-2 tabular hover:text-ink hover:underline">
                          <Time t={l.ts} format="seconds" />
                        </Link>
                        <Mono className="block text-[11px] text-ink-3">{l.id}</Mono>
                      </td>
                      <td>
                        <span className="who agent">
                          <span className="truncate">{l.driver}</span>
                        </span>
                        <div className="pl-[15px] text-[12px] text-ink-3">{l.tier === "unknown-automation" ? "Automated" : TIER_LABEL[l.tier]}</div>
                      </td>
                      <td>
                        <div className="max-w-[240px] truncate">
                          {person.label}
                          {person.device && <span className="ml-1.5 font-mono text-[12px] text-ink-3">{person.device}</span>}
                        </div>
                        {!site.anonymous && !person.device && <div className="text-[12px] text-ink-3">{l.account}</div>}
                      </td>
                      <td>
                        <div>{l.action.label}</div>
                        <div className="flex items-center gap-1.5">
                          <Method method={l.action.method} />
                          <Mono className="text-[11.5px] text-ink-3">{l.action.path}</Mono>
                        </div>
                      </td>
                      <td>
                        <RiskTag risk={l.action.risk} />
                      </td>
                      <td className="text-right">
                        <OutcomePill outcome={l.outcome} />
                        {l.price ? <Mono className="mt-1 block text-[12px] text-green">{formatPrice(l.price)}</Mono> : null}
                        <Mono className="mt-1 block text-[11px] text-ink-3">{l.policy}</Mono>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No agent actions">
            {counts.total ? "None match these filters in this range." : "Agent actions show up here once your app marks them with sensor.protect(), and an agent takes one."}
          </Empty>
        )}
        {lines.length >= SHOWN && (
          <div className="border-t border-line px-4 py-3 text-[12.5px] text-ink-3">
            Showing the {SHOWN} most recent of {num(total)}. {total > EXPORT_CAP ? `The export includes the most recent ${num(EXPORT_CAP)}.` : "The export includes them all."}
          </div>
        )}
      </Panel>
    </Page>
  );
}
