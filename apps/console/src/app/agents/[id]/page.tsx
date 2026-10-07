import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { AreaChart } from "@/components/area-chart";
import { BarList } from "@/components/charts";
import { LiveToggle } from "@/components/live";
import { SessionsTable } from "@/components/sessions-table";
import { Card, CardHeader, CardLink, Empty, Method, Mono, Page, PageHeader, RiskTag, Segmented, Stat, Stats, TierTag } from "@/components/ui";
import { getDriver } from "@/lib/catalog";
import { KIND_LABEL, hours, num, pct } from "@/lib/format";
import { RANGES, agentDetail, parseRange } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "unnamed" ? "Unnamed automation" : (getDriver(id)?.name ?? "Agent") };
}

export default async function AgentPage({ params, searchParams }: Props) {
  const { id } = await params;
  const range = parseRange((await searchParams).range);
  const r = RANGES.find((x) => x.id === range)!;
  const now = Date.now();
  const d = agentDetail(id, range, now);
  if (!d) notFound();
  const name = d.driver?.name ?? "Unnamed automation";
  const s = d.stat;

  return (
    <Page>
      <Link href={`/agents?range=${range}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft size={14} /> Agents
      </Link>
      <PageHeader
        title={name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{d.driver ? `${d.driver.provider} · ${KIND_LABEL[d.driver.kind]}` : "Clearly automated, but no known product matches"}</span>
            <TierTag tier={d.driver?.tier ?? "unknown-automation"} />
          </span>
        }
        actions={
          <>
            <Segmented label="Time range" items={RANGES.map((x) => ({ href: `/agents/${id}?range=${x.id}`, label: x.id, active: x.id === range }))} />
            <LiveToggle />
          </>
        }
      />

      <Card>
        <Stats cols={5}>
          <Stat label="Sessions" value={num(s?.sessions ?? 0)} sub={r.label.toLowerCase()} />
          <Stat label="Share of agents" value={pct(d.share, 1)} sub="of agent sessions" />
          <Stat label="People" value={num(s?.users ?? 0)} sub={`in ${num(s?.accounts ?? 0)} accounts`} />
          <Stat label="Took over" value={num(s?.takeovers ?? 0)} sub="from a person mid-session" />
          <Stat label="Sensitive actions" value={num(s?.sensitive ?? 0)} sub={`of ${num(s?.agentActions ?? 0)} actions`} />
        </Stats>
        <div className="border-t border-line px-2 pt-4 pb-2 md:px-3">
          <AreaChart points={d.series} bucket={d.bucket} from={now - r.ms} to={now} series={["agent"]} height={200} />
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="What it does" description="Its most frequent actions" />
          {d.actions.length ? (
            <ul className="divide-y divide-line">
              {d.actions.map((a) => (
                <li key={a.action.id} className="grid grid-cols-[1fr_auto_56px] items-center gap-4 px-5 py-2.5">
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
            <Empty title="No actions yet" />
          )}
        </Card>

        <Card>
          <CardHeader title="Who uses it" description="Accounts by agent hours" action={<CardLink href={`/accounts?range=${range}`}>All accounts</CardLink>} />
          {d.accounts.length ? (
            <BarList
              rows={d.accounts.map((a) => ({
                key: a.id,
                label: a.name,
                sub: `${num(a.agentUsers)} ${a.agentUsers === 1 ? "person" : "people"}`,
                value: a.agentHours,
                display: hours(a.agentHours),
                href: `/sessions?account=${a.id}&type=agent`,
              }))}
            />
          ) : (
            <Empty title="Not seen in this range" />
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Recent sessions" action={<CardLink href={`/sessions?type=agent${d.driver ? `&driver=${d.driver.id}` : ""}`}>All sessions</CardLink>} />
        {d.recent.length ? <SessionsTable rows={d.recent} now={now} /> : <Empty title="No sessions in this range" />}
      </Card>
    </Page>
  );
}
