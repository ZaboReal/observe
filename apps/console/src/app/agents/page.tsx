import Link from "next/link";
import type { Metadata } from "next";

import { Sparkline } from "@/components/charts";
import { LiveToggle } from "@/components/live";
import { Card, Meter, Page, PageHeader, Segmented, Stat, Stats, TierTag } from "@/components/ui";
import { KIND_LABEL, num, pct } from "@/lib/format";
import { RANGES, agents, parseRange } from "@/lib/queries";

export const metadata: Metadata = { title: "Agents" };
export const dynamic = "force-dynamic";

export default async function AgentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const range = parseRange((await searchParams).range);
  const data = agents(range);
  const maxShare = Math.max(...data.rows.map((r) => r.share), 0.01);
  const verified = data.rows.filter((r) => r.driver?.tier === "verified").reduce((n, r) => n + r.sessions, 0);

  return (
    <Page>
      <PageHeader
        title="Agents"
        description="Every agent product seen driving your app, named by signature or by how it moves."
        actions={
          <>
            <Segmented label="Time range" items={RANGES.map((x) => ({ href: `/agents?range=${x.id}`, label: x.id, active: x.id === range }))} />
            <LiveToggle />
          </>
        }
      />

      <Card className="mb-5">
        <Stats>
          <Stat label="Agent sessions" value={num(data.totals.agent)} sub={`${pct(data.totals.agent, data.totals.sessions)} of all sessions`} />
          <Stat label="Agent products" value={num(data.rows.filter((r) => r.driver).length)} sub={`of ${num(data.known)} we can name`} />
          <Stat label="Verified by signature" value={pct(verified, data.totals.agent)} sub="the rest are named by behaviour" />
          <Stat label="Took over from a person" value={num(data.totals.takeovers)} sub="mid-session handoffs" />
        </Stats>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left">
            <thead>
              <tr className="border-b border-line text-[12px] text-ink-3">
                <th className="py-2.5 pr-3 pl-5 font-normal">Agent</th>
                <th className="px-3 py-2.5 font-normal">Identified as</th>
                <th className="px-3 py-2.5 text-right font-normal">Sessions</th>
                <th className="w-[180px] px-3 py-2.5 font-normal">Share of agents</th>
                <th className="px-3 py-2.5 text-right font-normal">People</th>
                <th className="px-3 py-2.5 text-right font-normal">Sensitive actions</th>
                <th className="py-2.5 pr-5 pl-3 text-right font-normal">Last 7 days</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const id = r.driver?.id ?? "unnamed";
                return (
                  <tr key={id} className="border-b border-line last:border-0 hover:bg-wash">
                    <td className="py-3 pr-3 pl-5">
                      <Link href={`/agents/${id}?range=${range}`} className="text-[13.5px] font-medium hover:underline">
                        {r.driver?.name ?? "Unnamed automation"}
                      </Link>
                      <div className="text-[12px] text-ink-3">{r.driver ? `${r.driver.provider} · ${KIND_LABEL[r.driver.kind]}` : "Automated, product unknown"}</div>
                    </td>
                    <td className="px-3 py-3">
                      <TierTag tier={r.driver?.tier ?? "unknown-automation"} />
                    </td>
                    <td className="px-3 py-3 text-right text-[13px] tabular">{num(r.sessions)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Meter value={r.share} max={maxShare} className="flex-1" tone={r.driver ? "ink" : "grey"} />
                        <span className="w-9 text-right text-[12.5px] text-ink-3 tabular">{pct(r.share, 1)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-[13px] tabular">{num(r.users)}</td>
                    <td className="px-3 py-3 text-right text-[13px] tabular">{num(r.sensitive)}</td>
                    <td className="py-3 pr-5 pl-3">
                      <div className="flex justify-end">
                        <Sparkline values={r.trend} label={`${r.driver?.name ?? "Unnamed automation"} sessions per day`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-[12.5px] text-ink-3">
        Showing agents seen {RANGES.find((x) => x.id === range)!.label.toLowerCase()}; the sensor can name {num(data.known)} in all. Verified agents sign their requests (Web Bot Auth). Recognised agents are named from input mechanics and page artifacts, so a new release can change how they look.
      </p>
    </Page>
  );
}
