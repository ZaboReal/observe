import type { Metadata } from "next";

import { FilterChip, SearchBox, SelectFilter, ToggleFilter } from "@/components/filters";
import { LiveToggle } from "@/components/live";
import { SessionsTable } from "@/components/sessions-table";
import { Empty, Page, PageHeader, Panel, SegCount, Segmented } from "@/components/ui";
import { getAccount } from "@/lib/catalog";
import { accountText, num } from "@/lib/format";
import { RANGES, listVisits, parseRange, seenDrivers } from "@/lib/queries";
import { currentSite } from "@/lib/current-site";
import { syncStore } from "@/lib/sync";
import type { Verdict } from "@/lib/types";

export const metadata: Metadata = { title: "Sessions" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function href(params: Params, changes: Record<string, string | null>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string") next.set(k, v);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `/sessions?${qs}` : "/sessions";
}

export default async function SessionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await syncStore();
  const site = await currentSite();
  const params = await searchParams;
  const range = parseRange(one(params.range));
  const v = one(params.type);
  const verdict: Verdict | "all" = v === "human" || v === "agent" || v === "unknown" ? v : "all";
  const accountId = one(params.account);
  const now = Date.now();
  const { rows, total, counts } = listVisits(
    {
      siteId: site.id,
      range,
      verdict,
      driverId: one(params.driver),
      accountId,
      q: one(params.q),
      live: one(params.live) === "1",
      limit: 100,
    },
    now,
  );

  const tabs: { id: Verdict | "all"; label: string; n: number }[] = [
    { id: "all", label: "All", n: counts.all },
    { id: "agent", label: "Agents", n: counts.agent },
    { id: "human", label: "People", n: counts.human },
    { id: "unknown", label: "Undecided", n: counts.unknown },
  ];

  return (
    <Page>
      <PageHeader
        title="Sessions"
        description={
          site.anonymous
            ? `Every visit to ${site.host}, with who is driving it. Tabs from one visit share a row; open one to see how each tab was decided.`
            : "Every signed-in visit, with who is driving it. Tabs from one visit share a row; open one to see how each tab was decided."
        }
        actions={
          <>
            <Segmented label="Time range" items={RANGES.map((x) => ({ href: href(params, { range: x.id }), label: x.id, active: x.id === range }))} />
            <LiveToggle />
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          label="Who is driving"
          items={tabs.map((t) => ({
            key: t.id,
            href: href(params, { type: t.id === "all" ? null : t.id }),
            active: t.id === verdict,
            label: (
              <>
                {t.label} <SegCount n={num(t.n)} active={t.id === verdict} />
              </>
            ),
          }))}
        />
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <SearchBox placeholder={site.anonymous ? "Search visitor or session" : "Search person or account"} />
          <SelectFilter name="driver" label="All agents" options={seenDrivers(site.id, now)} />
          <ToggleFilter name="live" label="Live only" />
          {accountId && <FilterChip name="account" label={accountText(accountId, getAccount(accountId)?.name ?? accountId)} />}
        </div>
      </div>

      <Panel flush>
        {rows.length ? <SessionsTable rows={rows} now={now} anonymous={site.anonymous} markSensor={site.demo} /> : <Empty title="No sessions match">Try a wider time range or clear a filter.</Empty>}
        {total > rows.length && (
          <div className="border-t border-line px-4 py-3 text-[12.5px] text-ink-3">
            Showing the {num(rows.length)} most recent of {num(total)}.
          </div>
        )}
      </Panel>
    </Page>
  );
}
