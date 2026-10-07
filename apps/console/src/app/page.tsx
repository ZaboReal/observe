import { AreaChart } from "@/components/area-chart";
import { BarList, HoursBars } from "@/components/charts";
import { LiveToggle } from "@/components/live";
import { SessionsTable } from "@/components/sessions-table";
import { Card, CardHeader, CardLink, LiveDot, Page, PageHeader, RiskTag, Segmented, Stat, Stats, VerdictKey } from "@/components/ui";
import { hours, num, pct } from "@/lib/format";
import { RANGES, listSessions, overview, parseRange } from "@/lib/queries";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const range = parseRange((await searchParams).range);
  const r = RANGES.find((x) => x.id === range)!;
  const now = Date.now();
  const data = overview(range, now);
  const recent = listSessions({ range: "1h", limit: 8 }, now);
  const t = data.totals;

  const agentShare = t.sessions ? t.agent / t.sessions : 0;
  const prevShare = data.previous && data.previous.sessions ? data.previous.agent / data.previous.sessions : null;
  const shift = prevShare === null ? null : (agentShare - prevShare) * 100;
  const sensitive = data.scopes.filter((s) => s.scope !== "view");
  const maxHours = Math.max(...data.accounts.map((a) => Math.max(a.humanHours, a.agentHours)), 0.1);

  return (
    <Page>
      <PageHeader
        title="Overview"
        description={
          <>
            Who is driving logged-in sessions on <span className="font-mono text-[13px] text-ink-2">{SITE.host}</span>
          </>
        }
        actions={
          <>
            <Segmented label="Time range" items={RANGES.map((x) => ({ href: `/?range=${x.id}`, label: x.id, active: x.id === range }))} />
            <LiveToggle />
          </>
        }
      />

      <Card>
        <Stats>
          <Stat label="Sessions" value={num(t.sessions)} sub={r.label.toLowerCase()} />
          <Stat label="Human" mark={<VerdictKey verdict="human" />} value={num(t.human)} sub={pct(t.human, t.sessions)} />
          <Stat
            label="Agent"
            mark={<VerdictKey verdict="agent" />}
            value={num(t.agent)}
            sub={
              <>
                {pct(t.agent, t.sessions)}
                {shift !== null && (
                  <span className="ml-2 text-ink-2" title={`Agent share vs the previous ${r.label.toLowerCase().replace("last ", "")}`}>
                    {shift >= 0 ? "↑" : "↓"} {Math.abs(shift).toFixed(1)} pts
                  </span>
                )}
              </>
            }
          />
          <Stat label="Unknown" mark={<VerdictKey verdict="unknown" />} value={num(t.unknown)} sub={pct(t.unknown, t.sessions)} />
        </Stats>
        <div className="border-t border-line px-2 pt-4 pb-2 md:px-3">
          <AreaChart points={data.series} bucket={data.bucket} from={now - r.ms} to={now} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line px-5 py-3 text-[12.5px] text-ink-3">
          <span className="flex items-center gap-2">
            <VerdictKey verdict="agent" /> Agent
          </span>
          <span className="flex items-center gap-2">
            <VerdictKey verdict="human" /> Human
          </span>
          <span className="flex items-center gap-2">
            <VerdictKey verdict="unknown" /> Unknown: too little evidence to call
          </span>
          <span className="ml-auto">Sessions started per {data.bucket >= 3_600_000 ? `${data.bucket / 3_600_000} hours` : `${data.bucket / 60_000} minutes`}</span>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Right now" description="Sessions active in the last few minutes" />
          <div className="px-5 py-5">
            <div className="flex items-baseline gap-2">
              <span className="text-[40px] leading-none font-semibold tracking-[-0.03em]">{num(data.liveAgents)}</span>
              <span className="text-[13px] text-ink-3">agents acting</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-3">
              <LiveDot />
              {num(data.live)} live sessions in total
            </div>
          </div>
          <dl className="grid grid-cols-2 border-t border-line">
            <div className="border-r border-line px-5 py-4">
              <dt className="text-[12.5px] text-ink-3">Takeovers</dt>
              <dd className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">{num(t.takeovers)}</dd>
              <dd className="mt-0.5 text-[12px] text-ink-3">person, then agent</dd>
            </div>
            <div className="px-5 py-4">
              <dt className="text-[12.5px] text-ink-3">Sensitive actions</dt>
              <dd className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">{num(t.sensitive)}</dd>
              <dd className="mt-0.5 text-[12px] text-ink-3">by agents</dd>
            </div>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Agents" description="Share of agent sessions by driver" action={<CardLink href={`/agents?range=${range}`}>All agents</CardLink>} />
          <BarList
            rows={data.drivers.slice(0, 6).map((d) => ({
              key: d.driver?.id ?? "unnamed",
              label: d.driver?.name ?? "Unnamed automation",
              sub: d.driver?.provider,
              value: d.sessions,
              display: (
                <>
                  {num(d.sessions)} <span className="ml-1.5 inline-block w-9 text-right text-ink-3">{pct(d.sessions, t.agent)}</span>
                </>
              ),
              muted: !d.driver,
              href: `/agents/${d.driver?.id ?? "unnamed"}?range=${range}`,
            }))}
          />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="What agents did" description="Agent actions by scope. Everything except view is sensitive." action={<CardLink href={`/log?range=${range}&sensitive=1`}>Entry log</CardLink>} />
          <ul className="divide-y divide-line">
            {[data.scopes[0]!, ...sensitive].map((s) => (
              <li key={s.scope} className="grid grid-cols-[1fr_auto_64px] items-center gap-4 px-5 py-2.5">
                <span className={`text-[13.5px] ${s.scope === "view" ? "text-ink-3" : ""}`}>{s.label}</span>
                <RiskTag risk={s.risk} />
                <span className="text-right text-[13px] tabular">{num(s.count)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Agent time by account" description="Hours on the same logins: people, then agents" action={<CardLink href={`/accounts?range=${range}`}>All accounts</CardLink>} />
          <ul className="divide-y divide-line">
            {data.accounts.map((a) => (
              <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_72px] items-center gap-4 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[13.5px]">{a.name}</div>
                  <div className="truncate text-[12px] text-ink-3">{a.topDriver ?? "No agents"}</div>
                </div>
                <HoursBars human={a.humanHours} agent={a.agentHours} max={maxHours} />
                <div className="text-right text-[12px] leading-[1.35] text-ink-3 tabular">
                  <div>{hours(a.humanHours)} human</div>
                  <div className="text-ink">{hours(a.agentHours)} agent</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Latest sessions" description="Started in the last hour" action={<CardLink href="/sessions">All sessions</CardLink>} />
        <SessionsTable rows={recent.rows} now={now} compact />
      </Card>
    </Page>
  );
}
