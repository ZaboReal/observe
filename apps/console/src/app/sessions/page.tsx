import Link from "next/link";
import type { Metadata } from "next";

import { FilterChip, SearchBox, SelectFilter, ToggleFilter } from "@/components/filters";
import { LiveToggle } from "@/components/live";
import { SessionsTable } from "@/components/sessions-table";
import { Card, Empty, Page, PageHeader, Segmented } from "@/components/ui";
import { getAccount } from "@/lib/catalog";
import { num } from "@/lib/format";
import { RANGES, listSessions, parseRange, seenDrivers } from "@/lib/queries";
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
  const params = await searchParams;
  const range = parseRange(one(params.range));
  const v = one(params.type);
  const verdict: Verdict | "all" = v === "human" || v === "agent" || v === "unknown" ? v : "all";
  const accountId = one(params.account);
  const now = Date.now();
  const { rows, total, counts } = listSessions(
    {
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
    { id: "all", label: "All", n: counts.sessions },
    { id: "agent", label: "Agent", n: counts.agent },
    { id: "human", label: "Human", n: counts.human },
    { id: "unknown", label: "Unknown", n: counts.unknown },
  ];

  return (
    <Page>
      <PageHeader
        title="Sessions"
        description="Every logged-in session, classified as it happens. Open one to see why."
        actions={
          <>
            <Segmented label="Time range" items={RANGES.map((x) => ({ href: href(params, { range: x.id }), label: x.id, active: x.id === range }))} />
            <LiveToggle />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox placeholder="Search identity or account" />
        <SelectFilter name="driver" label="All drivers" options={seenDrivers(now)} />
        <ToggleFilter name="live" label="Live only" />
        {accountId && <FilterChip name="account" label={getAccount(accountId)?.name ?? accountId} />}
      </div>

      <Card>
        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-3" role="tablist" aria-label="Session type">
          {tabs.map((t) => {
            const active = t.id === verdict;
            return (
              <Link
                key={t.id}
                role="tab"
                aria-selected={active}
                href={href(params, { type: t.id === "all" ? null : t.id })}
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
        {rows.length ? (
          <SessionsTable rows={rows} now={now} />
        ) : (
          <Empty title="No sessions match">Try a wider time range or clear a filter.</Empty>
        )}
        {total > rows.length && (
          <div className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3">
            Showing the {num(rows.length)} most recent of {num(total)}.
          </div>
        )}
      </Card>
    </Page>
  );
}
