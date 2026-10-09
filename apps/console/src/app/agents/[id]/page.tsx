import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { ShareList } from "@/components/charts";
import { ColumnChart } from "@/components/column-chart";
import { LiveToggle } from "@/components/live";
import { SessionsTable } from "@/components/sessions-table";
import { Avatar, Empty, Method, Mono, Page, Panel, PanelLink, Pill, RiskTag, Segmented, Tile, Tiles, TierTag } from "@/components/ui";
import { getDriver } from "@/lib/catalog";
import { KIND_LABEL, hours, num, pct } from "@/lib/format";
import { RANGES, agentDetail, parseRange } from "@/lib/queries";
import { currentSite } from "@/lib/current-site";
import { syncStore } from "@/lib/sync";
import { ruleSummary } from "@/lib/views";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "unnamed" ? "Unknown automation" : (getDriver(id)?.name ?? "Agent") };
}

const WORDS: Record<string, string> = { "1h": "every 4 minutes", "24h": "every hour", "7d": "every 8 hours" };

export default async function AgentPage({ params, searchParams }: Props) {
  await syncStore();
  const site = await currentSite();
  const { id } = await params;
  const range = parseRange((await searchParams).range);
  const r = RANGES.find((x) => x.id === range)!;
  const now = Date.now();
  const d = agentDetail(site.id, id, range, now);
  if (!d) notFound();
  const name = d.driver?.name ?? "Unknown automation";
  const s = d.stat;
  const tier = d.driver?.tier ?? "unknown-automation";
  const rules = ruleSummary(tier, site.id, d.driver?.id ?? null);
  const maxAccount = Math.max(...d.accounts.map((a) => a.agentHours), 0.01);
  const period = r.label.toLowerCase();

  return (
    <Page>
      <Link href={`/agents?range=${range}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={14} /> Agents
      </Link>

      <header className="mb-6 flex flex-col gap-4 md:mb-7 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={name} provider={d.driver?.provider} size={52} />
          <div className="min-w-0">
            <h1 className="text-[28px] leading-[1.08] font-medium tracking-[-0.035em] md:text-[34px]">{name}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-2">
              <span>{d.driver ? `${d.driver.provider} · ${KIND_LABEL[d.driver.kind]}` : "Clearly automated, but no known product matches"}</span>
              <TierTag tier={tier} className="text-[14px] text-ink-3" />
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Segmented label="Time range" items={RANGES.map((x) => ({ href: `/agents/${id}?range=${x.id}`, label: x.id, active: x.id === range }))} />
          <LiveToggle />
        </div>
      </header>

      <div className="grid gap-3">
        <Tiles cols={5}>
          <Tile label="Sessions" value={num(s?.sessions ?? 0)} sub={period} />
          <Tile label="Share of agents" value={pct(d.share, 1)} sub="of agent sessions" />
          <Tile
            label={site.anonymous ? "Visitors" : "People"}
            value={num(s?.users ?? 0)}
            sub={site.anonymous ? "it acted for" : `in ${num(s?.accounts ?? 0)} ${s?.accounts === 1 ? "account" : "accounts"}`}
          />
          <Tile label="Took over" value={num(s?.takeovers ?? 0)} sub="from a person mid-session" />
          <Tile label="Sensitive actions" value={num(s?.sensitive ?? 0)} sub={`of ${num(s?.agentActions ?? 0)} actions`} />
        </Tiles>

        <Panel title="Sessions" description={`Sessions it drove, started ${WORDS[range]}, ${period}`}>
          <ColumnChart points={d.series} bucket={d.bucket} from={now - r.ms} to={now} series={["agent"]} height={200} caption={`${name} sessions started ${WORDS[range]}, ${period}`} />
        </Panel>

        <div className={`grid gap-3 ${site.anonymous ? "" : "lg:grid-cols-2"}`}>
          <Panel
            title="What it does"
            description="Its most frequent actions"
            action={
              <Link href={`/rules?agent=${d.driver?.id ?? "unnamed"}`} className="flex shrink-0 items-center gap-2 pt-0.5 text-[12.5px] text-ink-3 hover:text-ink">
                Rules
                <Pill tone={rules.tone}>{rules.label}</Pill>
              </Link>
            }
            flush
          >
            {d.actions.length ? (
              <ul>
                {d.actions.map((a) => (
                  <li key={a.action.id} className="grid grid-cols-[minmax(0,1fr)_auto_56px] items-center gap-4 border-t border-line px-4 py-2.5 first:border-t-0">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px]">{a.action.label}</div>
                      <div className="flex items-center gap-1.5">
                        <Method method={a.action.method} />
                        <Mono className="truncate text-[11.5px] text-ink-3">{a.action.path}</Mono>
                      </div>
                    </div>
                    <RiskTag risk={a.action.risk} />
                    <span className="text-right text-[13px] tabular">{num(a.count)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No actions yet">Nothing sensitive {period}.</Empty>
            )}
          </Panel>

          {!site.anonymous && (
            <Panel title="Who uses it" description="Accounts by agent hours" action={<PanelLink href={`/accounts?range=${range}`}>Accounts</PanelLink>}>
              {d.accounts.length ? (
                <ShareList
                  max={maxAccount}
                  rows={d.accounts.map((a) => ({
                    key: a.id,
                    label: a.name,
                    sub: `${num(a.agentUsers)} ${a.agentUsers === 1 ? "person" : "people"}`,
                    share: a.agentHours,
                    display: hours(a.agentHours),
                    href: `/sessions?account=${a.id}&type=agent`,
                  }))}
                />
              ) : (
                <Empty title="Not seen in this range" />
              )}
            </Panel>
          )}
        </div>

        <Panel title="Recent sessions" action={<PanelLink href={`/sessions?type=agent${d.driver ? `&driver=${d.driver.id}` : "&driver=unnamed"}`}>All sessions</PanelLink>} flush>
          {d.recent.length ? <SessionsTable rows={d.recent} now={now} anonymous={site.anonymous} markSensor={site.demo} /> : <Empty title="No sessions in this range" />}
        </Panel>
      </div>
    </Page>
  );
}
