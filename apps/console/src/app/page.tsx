import Link from "next/link";

import { HoursBars, ShareList } from "@/components/charts";
import { ChartLegend, ColumnChart } from "@/components/column-chart";
import { LiveToggle } from "@/components/live";
import { LiveFeed } from "@/components/live-feed";
import { SessionsTable } from "@/components/sessions-table";
import { Empty, Panel, PanelLink, Segmented, ShareBar, Tile, Tiles, buttonClass } from "@/components/ui";
import { hours, num, pct } from "@/lib/format";
import { parseRange } from "@/lib/queries";
import { currentSite } from "@/lib/current-site";
import { syncStore } from "@/lib/sync";
import type { Verdict } from "@/lib/types";
import { dashboard } from "@/lib/views";

export const dynamic = "force-dynamic";

const PREVIOUS: Record<string, string> = { "1h": "the hour before", "24h": "the day before", "7d": "the week before" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await syncStore();
  const site = await currentSite();
  const range = parseRange((await searchParams).range);
  const now = Date.now();
  const d = dashboard(site.id, range, now, { routes: site.anonymous });
  const t = d.totals;
  const period = d.range.label.toLowerCase();

  const shift = d.previousShare === null ? null : (d.share - d.previousShare) * 100;
  const blocked = d.outcomes.refuse;
  const asked = d.outcomes.ask + d.outcomes.request_access;
  const series: Verdict[] = t.unknown ? ["human", "agent", "unknown"] : ["human", "agent"];
  const maxHours = Math.max(...d.accounts.map((a) => Math.max(a.humanHours, a.agentHours)), 0.1);
  const agentScopes = d.scopes.filter((s) => s.count > 0);
  const maxScope = Math.max(...d.scopes.map((s) => s.count), 1);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-5 pb-16 md:px-8 md:pt-8">
      <header className="mb-5 flex flex-col gap-4 md:mb-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="eyebrow mb-2.5">Overview</div>
          <h1 className="text-[28px] leading-[1.08] font-medium tracking-[-0.035em] break-words md:text-[34px]">
            Who&apos;s driving <em>{site.host}</em>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Segmented label="Time range" items={(["1h", "24h", "7d"] as const).map((id) => ({ href: `/?range=${id}`, label: id, active: id === range }))} />
          <LiveToggle />
        </div>
      </header>

      <div className="grid gap-3">
        <Tiles>
          <Tile label="Sessions now" value={num(d.live.sessions)} sub={d.live.sessions ? `${num(d.live.agents)} driven by agents` : "Nobody on the site right now"} />
          <Tile
            label="Driven by agents"
            value={t.sessions ? pct(t.agent, t.sessions) : "–"}
            sub={
              !t.sessions
                ? `No sessions ${period}`
                : shift !== null && Math.abs(shift) >= 0.05
                  ? `${shift > 0 ? "+" : "−"}${Math.abs(shift).toFixed(1)} points on ${PREVIOUS[range]}`
                  : `of ${num(t.sessions)} ${t.sessions === 1 ? "session" : "sessions"}, ${period}`
            }
          />
          <Tile
            label="Agents seen"
            value={num(d.agentsSeen)}
            sub={
              site.anonymous
                ? `across ${num(d.peopleWithAgents)} ${d.peopleWithAgents === 1 ? "visitor" : "visitors"}`
                : `across ${num(d.accountsWithAgents)} ${d.accountsWithAgents === 1 ? "account" : "accounts"}`
            }
          />
          <Tile
            label="Would be blocked"
            value={num(blocked)}
            sub={d.agentActions ? `${asked ? `${num(asked)} more would ask first. ` : ""}Observe mode: none blocked.` : "No agent actions yet. Observe mode: nothing is blocked."}
          />
        </Tiles>

        <div className="grid gap-3 lg:grid-cols-[1.7fr_1fr]">
          <Panel
            title="People and agents"
            description={`Sessions started ${d.chart.words}, ${period}`}
            action={
              <div className="hidden pt-0.5 sm:block">
                <ChartLegend series={series} />
              </div>
            }
          >
            <div className="mb-2 sm:hidden">
              <ChartLegend series={series} />
            </div>
            <ColumnChart
              points={d.chart.points}
              bucket={d.chart.bucket}
              from={now - d.range.ms}
              to={now}
              series={series}
              caption={`Sessions started ${d.chart.words}, ${period}: people, agents${t.unknown ? " and undecided" : ""}`}
            />
            {t.unknown > 0 && <p className="mt-1 text-[12px] text-ink-3">Undecided: {num(t.unknown)} sessions with too little evidence to call yet.</p>}
          </Panel>

          <Panel title="Top agents" description="Share of agent sessions" action={<PanelLink href={`/agents?range=${range}`}>All</PanelLink>}>
            {d.topAgents.length ? (
              <>
                <ShareList
                  rows={d.topAgents.slice(0, 6).map((a) => ({
                    key: a.id,
                    label: a.name,
                    share: a.share,
                    href: `/agents/${a.id}?range=${range}`,
                  }))}
                  max={d.topAgents[0]!.share}
                />
                {d.topAgents.length > 6 && <p className="mt-2 px-2 text-[12px] text-ink-3">and {d.topAgents.length - 6} more</p>}
              </>
            ) : (
              <Empty title="No agents yet">No session {period} was driven by an agent.</Empty>
            )}
          </Panel>
        </div>

        <Panel
          title="Live activity"
          description={
            d.feed.kind === "actions"
              ? "Agent actions as they happen, with what your rules would do. Observe mode: logged, not enforced."
              : "Pages agents open, as they happen, with what your rules would do. Observe mode: logged, not enforced."
          }
          action={<PanelLink href={`/activity?range=${range}`}>Activity</PanelLink>}
        >
          {d.feed.rows.length ? (
            <LiveFeed rows={d.feed.rows} showFor />
          ) : (
            <Empty
              title="No agent actions yet"
              action={
                <Link href="/setup" className={buttonClass("ghost")}>
                  Mark sensitive actions
                </Link>
              }
            >
              Actions show up here once an agent exports, edits or invites something your app marks with <span className="font-mono text-[12px]">sensor.protect()</span>.
            </Empty>
          )}
        </Panel>

        <div className="grid gap-3 lg:grid-cols-2">
          <Panel
            title="What agents did"
            description={`Agent actions by kind, ${period}`}
            action={agentScopes.length ? <PanelLink href={`/activity?range=${range}&sensitive=1`}>Sensitive only</PanelLink> : undefined}
          >
            {agentScopes.length ? (
              <ul className="grid gap-0.5">
                {d.scopes.map((s) => (
                  <li key={s.scope} className="grid grid-cols-[minmax(0,1fr)_minmax(56px,30%)_52px] items-center gap-3 px-2 py-[7px]">
                    <span className={`truncate text-[13.5px] ${s.count ? "" : "text-ink-3"}`}>{s.label}</span>
                    <ShareBar value={s.count} max={maxScope} />
                    <span className="text-right text-[13px] tabular">{num(s.count)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No agent actions yet">
                Exports, edits and invites show up here once your app marks them with <span className="font-mono text-[12px]">sensor.protect()</span>.
              </Empty>
            )}
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line px-2 pt-3 text-[13px]">
              <span className="text-ink-2">Agent took over from a person</span>
              <span className="font-medium tabular">
                {num(t.takeovers)} {t.takeovers === 1 ? "session" : "sessions"}
              </span>
            </div>
          </Panel>

          {site.anonymous || !d.accounts.length ? (
            <Panel title="Where agents go" description={`Pages agents opened most, ${period}`}>
              {d.routes.length ? (
                <ul className="grid gap-0.5">
                  {d.routes.map((r) => (
                    <li key={r.route} className="grid grid-cols-[minmax(0,1fr)_minmax(56px,30%)_72px] items-center gap-3 px-2 py-[7px]">
                      <span className="truncate font-mono text-[12.5px]">{r.route}</span>
                      <ShareBar value={r.views} max={d.routes[0]!.views} />
                      <span className="text-right text-[13px] tabular">
                        {num(r.views)} {r.views === 1 ? "view" : "views"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="No agents yet">Pages show up here as soon as an agent opens one.</Empty>
              )}
            </Panel>
          ) : (
            <Panel title="Agent time by account" description="Hours on the same logins: people, then agents" action={<PanelLink href={`/accounts?range=${range}`}>Accounts</PanelLink>}>
              <ul className="grid gap-0.5">
                {d.accounts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/sessions?account=${a.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_82px] items-center gap-x-4 gap-y-2 rounded-lg px-2 py-2 transition-colors hover:bg-tile sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_82px]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px]">{a.name}</span>
                        <span className="block truncate text-[12px] text-ink-3">{a.topDriver ?? "No agents"}</span>
                      </span>
                      <span className="order-last col-span-2 sm:order-none sm:col-span-1">
                        <HoursBars human={a.humanHours} agent={a.agentHours} max={maxHours} />
                      </span>
                      <span className="text-right text-[12px] leading-[1.4] text-ink-3 tabular">
                        <span className="block">{hours(a.humanHours)} people</span>
                        <span className="block text-ink">{hours(a.agentHours)} agents</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel title="Latest sessions" description={`Started ${period}`} action={<PanelLink href={`/sessions?range=${range}`}>All sessions</PanelLink>} flush>
          {d.latest.length ? (
            <SessionsTable rows={d.latest} now={now} anonymous={site.anonymous} markSensor={site.demo} />
          ) : (
            <Empty title="No sessions yet">Sessions appear here as soon as the sensor reports one.</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}
