import Link from "next/link";
import type { Metadata } from "next";

import { Sparkline } from "@/components/charts";
import { LiveToggle } from "@/components/live";
import { Avatar, Empty, Page, PageHeader, Panel, Segmented, ShareBar, Tile, Tiles, TierTag } from "@/components/ui";
import { KIND_LABEL, num, pct } from "@/lib/format";
import { RANGES, agents, parseRange } from "@/lib/queries";
import { currentSite } from "@/lib/current-site";
import { syncStore } from "@/lib/sync";

export const metadata: Metadata = { title: "Agents" };
export const dynamic = "force-dynamic";

export default async function AgentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await syncStore();
  const site = await currentSite();
  const range = parseRange((await searchParams).range);
  const r = RANGES.find((x) => x.id === range)!;
  const data = agents(site.id, range);
  const maxShare = Math.max(...data.rows.map((x) => x.share), 0.01);
  const verified = data.rows.filter((x) => x.driver?.tier === "verified").reduce((n, x) => n + x.sessions, 0);
  const who = site.anonymous ? "Visitors" : "People";

  return (
    <Page>
      <PageHeader
        title="Agents"
        description={`Every agent seen driving ${site.host}, named by its signature or by how it clicks and types.`}
        actions={
          <>
            <Segmented label="Time range" items={RANGES.map((x) => ({ href: `/agents?range=${x.id}`, label: x.id, active: x.id === range }))} />
            <LiveToggle />
          </>
        }
      />

      <div className="mb-3">
        <Tiles>
          <Tile label="Agent sessions" value={num(data.totals.agent)} sub={`${pct(data.totals.agent, data.totals.sessions)} of all sessions, ${r.label.toLowerCase()}`} />
          <Tile label="Agents seen" value={num(data.rows.filter((x) => x.driver).length)} sub={`of ${num(data.known)} we can name`} />
          <Tile label="Verified by signature" value={pct(verified, data.totals.agent)} sub="the rest are named by behaviour" />
          <Tile label="Took over from a person" value={num(data.totals.takeovers)} sub="hand-offs mid-session" />
        </Tiles>
      </div>

      <Panel flush>
        {data.rows.length ? (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[860px] text-[13.5px]">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Identified as</th>
                  <th className="text-right">Sessions</th>
                  <th className="w-[190px]">Share of agents</th>
                  <th className="text-right">{who}</th>
                  <th className="text-right">Sensitive actions</th>
                  <th className="text-right">Last 7 days</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((x) => {
                  const id = x.driver?.id ?? "unnamed";
                  const name = x.driver?.name ?? "Unknown automation";
                  return (
                    <tr key={id}>
                      <td>
                        <Link href={`/agents/${id}?range=${range}`} className="group flex items-center gap-3">
                          <Avatar name={name} provider={x.driver?.provider} size={30} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium group-hover:underline">{name}</span>
                            <span className="block truncate text-[12px] text-ink-3">{x.driver ? `${x.driver.provider} · ${KIND_LABEL[x.driver.kind]}` : "Automated, product unknown"}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="align-middle">
                        <TierTag tier={x.driver?.tier ?? "unknown-automation"} className="text-[13px] text-ink-2" />
                      </td>
                      <td className="text-right align-middle tabular">{num(x.sessions)}</td>
                      <td className="align-middle">
                        <div className="flex items-center gap-3">
                          <ShareBar value={x.share} max={maxShare} className="flex-1" />
                          <span className="w-10 text-right text-[12.5px] text-ink-2 tabular">{pct(x.share, 1)}</span>
                        </div>
                      </td>
                      <td className="text-right align-middle tabular">{num(x.users)}</td>
                      <td className="text-right align-middle tabular">{num(x.sensitive)}</td>
                      <td className="align-middle">
                        <div className="flex justify-end">
                          <Sparkline values={x.trend} label={`${name} sessions per day`} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No agents yet">No session {r.label.toLowerCase()} was driven by an agent. Try a wider range.</Empty>
        )}
      </Panel>
      <p className="mt-3 max-w-3xl text-[12.5px] leading-[1.55] text-ink-3">
        Showing agents seen {r.label.toLowerCase()}; the sensor can name {num(data.known)} in all. Verified agents sign their requests (Web Bot Auth). Recognised agents are named from how they click,
        type and scroll and the marks they leave on the page, so a new release can change how they look.
      </p>
    </Page>
  );
}
