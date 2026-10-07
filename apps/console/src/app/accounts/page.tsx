import Link from "next/link";
import type { Metadata } from "next";

import { HoursBars } from "@/components/charts";
import { LiveToggle } from "@/components/live";
import { Card, Page, PageHeader, Segmented, Stat, Stats } from "@/components/ui";
import { hours, num, pct } from "@/lib/format";
import { RANGES, accounts, parseRange } from "@/lib/queries";

export const metadata: Metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const range = parseRange((await searchParams).range);
  const r = RANGES.find((x) => x.id === range)!;
  const data = accounts(range);
  const max = Math.max(...data.rows.map((a) => Math.max(a.humanHours, a.agentHours)), 0.1);
  const agentPeople = data.rows.reduce((n, a) => n + a.agentUsers, 0);
  const people = data.rows.reduce((n, a) => n + a.users, 0);

  return (
    <Page>
      <PageHeader
        title="Accounts"
        description="Your customers' workspaces: who hands work to agents, and how much agent time sits on a seat priced for one person."
        actions={
          <>
            <Segmented label="Time range" items={RANGES.map((x) => ({ href: `/accounts?range=${x.id}`, label: x.id, active: x.id === range }))} />
            <LiveToggle />
          </>
        }
      />

      <Card className="mb-5">
        <Stats>
          <Stat label="Person-hours" value={hours(data.humanHours)} sub={r.label.toLowerCase()} />
          <Stat label="Agent-hours" value={hours(data.agentHours)} sub={`${pct(data.agentHours, data.humanHours + data.agentHours)} of all time in product`} />
          <Stat label="People using agents" value={num(agentPeople)} sub={`of ${num(people)} active`} />
          <Stat label="Agents outwork people" value={num(data.overSeat)} sub={`of ${num(data.rows.length)} accounts`} />
        </Stats>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left">
            <thead>
              <tr className="border-b border-line text-[12px] text-ink-3">
                <th className="py-2.5 pr-3 pl-5 font-normal">Account</th>
                <th className="px-3 py-2.5 text-right font-normal">Active / seats</th>
                <th className="px-3 py-2.5 text-right font-normal">Use agents</th>
                <th className="px-3 py-2.5 text-right font-normal">Agent sessions</th>
                <th className="w-[200px] px-3 py-2.5 font-normal">
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-3 rounded-full bg-ink-4" /> Person
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-3 rounded-full bg-ink" /> Agent
                    </span>
                  </span>
                </th>
                <th className="px-3 py-2.5 text-right font-normal">Hours</th>
                <th className="py-2.5 pr-5 pl-3 font-normal">Main agent</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((a) => {
                const over = a.agentHours > a.humanHours;
                return (
                  <tr key={a.id} className="border-b border-line last:border-0 hover:bg-wash">
                    <td className="py-3 pr-3 pl-5">
                      <Link href={`/sessions?account=${a.id}`} className="text-[13.5px] font-medium hover:underline">
                        {a.name}
                      </Link>
                      <div className="text-[12px] text-ink-3">
                        {a.domain} · {a.plan}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-[13px] tabular">
                      {num(a.users)} <span className="text-ink-4">/ {num(a.seats)}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-[13px] tabular">{num(a.agentUsers)}</td>
                    <td className="px-3 py-3 text-right text-[13px] tabular">
                      {num(a.agentSessions)} <span className="ml-1 inline-block w-9 text-ink-3">{pct(a.agentSessions, a.sessions)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <HoursBars human={a.humanHours} agent={a.agentHours} max={max} />
                    </td>
                    <td className="px-3 py-3 text-right text-[12.5px] leading-[1.35] tabular">
                      <div className="text-ink-3">{hours(a.humanHours)}</div>
                      <div className={over ? "font-medium" : ""}>{hours(a.agentHours)}</div>
                    </td>
                    <td className="py-3 pr-5 pl-3 text-[13px] text-ink-2">{a.topDriver ?? <span className="text-ink-4">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-[12.5px] text-ink-3">
        Hours count time between a session&apos;s first and last action. In a takeover, time before the handoff counts as the person&apos;s and time after it as the agent&apos;s.
      </p>
    </Page>
  );
}
