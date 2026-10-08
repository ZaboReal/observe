import Link from "next/link";
import type { Metadata } from "next";

import { LiveToggle } from "@/components/live";
import { Empty, Page, PageHeader, Panel, Segmented, ShareBar, Tile, Tiles, buttonClass } from "@/components/ui";
import { hours, num, pct } from "@/lib/format";
import { RANGES, parseRange } from "@/lib/queries";
import { currentSite } from "@/lib/current-site";
import { syncStore } from "@/lib/sync";
import { accountsView } from "@/lib/views";

export const metadata: Metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await syncStore();
  const site = await currentSite();
  const range = parseRange((await searchParams).range);
  const r = RANGES.find((x) => x.id === range)!;

  if (site.anonymous) {
    return (
      <Page>
        <PageHeader title="Accounts" description="Your customers' workspaces: who hands work to agents, and how much agent time sits on a seat priced for one person." />
        <Panel>
          <Empty
            title={`${site.host} visitors aren't signed in`}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/sessions" className={buttonClass("dark")}>
                  See sessions
                </Link>
                <Link href="/setup" className={buttonClass("ghost")}>
                  How to name accounts
                </Link>
              </div>
            }
          >
            Accounts group sessions by the customer workspace a person signs in to. Visitors to {site.host} don&apos;t sign in, so each one shows up as a Visitor with a short device id, and there are
            no accounts to show. Once a product calls <span className="font-mono text-[12px]">sensor.identify()</span> after sign-in, its accounts appear here.
          </Empty>
        </Panel>
      </Page>
    );
  }

  const data = accountsView(site.id, range);
  const people = data.rows.reduce((n, a) => n + a.users, 0);
  const agentPeople = data.rows.reduce((n, a) => n + a.agentUsers, 0);

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

      <div className="mb-3">
        <Tiles>
          <Tile label="Person hours" value={hours(data.humanHours)} sub={r.label.toLowerCase()} />
          <Tile label="Agent hours" value={hours(data.agentHours)} sub={`${pct(data.agentHours, data.humanHours + data.agentHours)} of all time in the product`} />
          <Tile label="People using agents" value={num(agentPeople)} sub={`of ${num(people)} active`} />
          <Tile label="Agents outwork people" value={num(data.overSeat)} sub={`of ${num(data.rows.length)} accounts`} />
        </Tiles>
      </div>

      <Panel flush>
        <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-1">
          <h2 className="text-[14px] font-medium">Agent time by account</h2>
          <span className="eyebrow">{r.label}</span>
        </div>
        {data.rows.length ? (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[760px] text-[13.5px]">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="text-right">Seats</th>
                  <th className="text-right">Person hours</th>
                  <th className="text-right">Agent hours</th>
                  <th>Agent share</th>
                  <th>Top agent</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((a) => {
                  const share = a.humanHours + a.agentHours ? a.agentHours / (a.humanHours + a.agentHours) : 0;
                  return (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/sessions?account=${a.id}`} className="font-medium hover:underline">
                          {a.name}
                        </Link>
                        <div className="text-[12px] text-ink-3">
                          {a.domain} · {a.plan} · {num(a.users)} active
                        </div>
                      </td>
                      <td className="text-right tabular">{num(a.seats)}</td>
                      <td className="text-right tabular">{hours(a.humanHours)}</td>
                      <td className={`text-right tabular ${a.agentHours > a.humanHours ? "font-medium" : ""}`}>{hours(a.agentHours)}</td>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <ShareBar value={share} className="w-[90px]" />
                          <span className="w-9 text-right text-[12.5px] tabular">{pct(share, 1)}</span>
                        </span>
                      </td>
                      <td className="text-ink-2">{a.topDriver ?? <span className="text-ink-3">None</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No accounts yet">Sessions are grouped by account once your app says who is signed in, with sensor.identify().</Empty>
        )}
      </Panel>
      <p className="mt-3 max-w-3xl text-[12.5px] leading-[1.55] text-ink-3">
        Hours count time between a session&apos;s first and last action. When an agent takes over, time before the hand-off counts as the person&apos;s and time after it as the agent&apos;s.
        {data.unassigned && ` ${num(data.unassigned.sessions)} ${data.unassigned.sessions === 1 ? "session" : "sessions"} from visitors who weren't signed in are left out.`}
      </p>
    </Page>
  );
}
