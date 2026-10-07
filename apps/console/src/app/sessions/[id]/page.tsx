import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { ReasonBars } from "@/components/charts";
import { LiveToggle } from "@/components/live";
import { SessionTrack } from "@/components/session-track";
import { Time } from "@/components/time";
import { Card, CardHeader, Empty, LiveDot, Method, Meter, Mono, OutcomeTag, Page, RiskTag, TierTag, VerdictBadge } from "@/components/ui";
import { KIND_LABEL, ago, duration, num } from "@/lib/format";
import { sessionDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = sessionDetail((await params).id);
  return { title: d ? `${d.row.email} · Session` : "Session" };
}

export default async function SessionPage({ params }: Props) {
  const d = sessionDetail((await params).id);
  if (!d) notFound();
  const { session: s, row, events, now } = d;

  const lastEvent = events[events.length - 1];
  const endAt = d.live ? now : s.startedAt + (lastEvent?.t ?? 0) + 20_000;
  const firstSensitive = d.decisions.find((x) => x.action.scope !== "view");
  const source = s.source === "sensor" ? "Sensor" : s.tier === "verified" ? "Signature" : "Behaviour";

  const moments = [
    { label: "Started", at: s.startedAt, note: { agent: "by an agent", human: "by a person", unknown: "driver not decided yet" }[events[0]?.driver ?? "unknown"] },
    ...(s.handoffAt !== null ? [{ label: `${d.driver?.name ?? "Agent"} took over`, at: s.startedAt + s.handoffAt, note: "input mechanics changed", strong: true }] : []),
    ...(firstSensitive ? [{ label: "First sensitive action", at: firstSensitive.at, note: firstSensitive.action.label }] : []),
    { label: d.live ? "Last activity" : "Ended", at: row.lastAt, note: d.live ? ago(row.lastAt, now) : `after ${duration(row.lastAt - s.startedAt)}` },
  ];

  return (
    <Page>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/sessions" className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
          <ArrowLeft size={14} /> Sessions
        </Link>
        {d.live && <LiveToggle />}
      </div>

      <header className="mb-7">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] break-all md:text-[26px]">{row.email}</h1>
          <VerdictBadge verdict={s.verdict} />
          {d.live && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <LiveDot /> Live
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-3">
          <Link href={`/sessions?account=${s.accountId}`} className="hover:text-ink">
            {d.account?.name ?? s.accountId}
          </Link>
          <span>{s.device}</span>
          <span>
            Started <Time t={s.startedAt} format="datetime" />
          </span>
          <span>{duration(row.lastAt - s.startedAt)}</span>
          <Mono className="text-ink-4">{s.id}</Mono>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Who drove, and when" description={`${num(events.filter((e) => e.type !== "page").length)} actions across ${num(events.filter((e) => e.type === "page").length)} page views`} />
          <div className="px-5 pt-5 pb-5">
            {events.length > 1 ? (
              <SessionTrack events={events} startedAt={s.startedAt} endAt={endAt} handoffAt={s.handoffAt} driverName={d.driver?.name ?? null} />
            ) : (
              <Empty title="Waiting for activity">The sensor has not reported any actions yet.</Empty>
            )}
          </div>
          <ol className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-4">
            {moments.map((m, i) => (
              <li key={m.label} className={`px-5 py-4 ${i ? "border-line max-sm:border-t sm:border-l" : ""}`}>
                <div className={`text-[13px] ${m.strong ? "font-medium" : "text-ink-2"}`}>{m.label}</div>
                <div className="mt-0.5 text-[13px] tabular"><Time t={m.at} format="seconds" />
                </div>
                <div className="mt-0.5 truncate text-[12px] text-ink-3">{m.note}</div>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHeader title="Passport" description="Who we think is driving, and how sure we are" />
          <dl className="divide-y divide-line text-[13px]">
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="text-ink-3">Driver</dt>
              <dd className="text-right">
                {s.verdict === "agent" ? (
                  <>
                    <div className="font-medium">{d.driver?.name ?? "Unnamed automation"}</div>
                    {d.driver && (
                      <div className="text-[12px] text-ink-3">
                        {d.driver.provider} · {KIND_LABEL[d.driver.kind]}
                      </div>
                    )}
                  </>
                ) : s.verdict === "human" ? (
                  "A person"
                ) : (
                  <span className="text-ink-3">Not decided yet</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="text-ink-3">Tier</dt>
              <dd>
                <TierTag tier={s.tier} size="md" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="text-ink-3">Source</dt>
              <dd>{source}</dd>
            </div>
            <div className="px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-3">Confidence</dt>
                <dd className="font-medium tabular">{s.verdict === "unknown" ? "—" : `${Math.round(s.confidence * 100)}%`}</dd>
              </div>
              <Meter value={s.verdict === "unknown" ? 0 : s.confidence} className="mt-2.5" />
            </div>
          </dl>
          <div className="border-t border-line px-5 pt-4 pb-5">
            <div className="mb-3 flex items-baseline justify-between text-[12px] text-ink-3">
              <span>Evidence</span>
              <span>← person · agent →</span>
            </div>
            {d.reasons.length ? <ReasonBars reasons={d.reasons} /> : <p className="text-[13px] text-ink-3">No evidence reported yet.</p>}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Activity" description="Visits by page and who drove them" />
          <ul className="divide-y divide-line">
            {d.activity.map((a, i) => (
              <li key={`${a.route}-${a.at}-${i}`} className="grid grid-cols-[1fr_auto_64px] items-center gap-3 px-5 py-3">
                <div className="min-w-0">
                  <Mono className="block truncate text-[13px]">{a.route}</Mono>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    <Time t={a.at} />
                  </div>
                </div>
                <VerdictBadge verdict={a.driver} size="sm" />
                <div className="text-right text-[12.5px] text-ink-3 tabular">
                  {a.actions ? `${a.actions} ${a.actions === 1 ? "action" : "actions"}` : "view"}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Agent actions"
            description="What the default policy would have decided. Observe mode logs these and blocks nothing."
          />
          {d.decisions.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-line text-[12px] text-ink-3">
                    <th className="py-2.5 pr-3 pl-5 font-normal">Time</th>
                    <th className="px-3 py-2.5 font-normal">Action</th>
                    <th className="px-3 py-2.5 font-normal">Risk</th>
                    <th className="py-2.5 pr-5 pl-3 text-right font-normal">Would decide</th>
                  </tr>
                </thead>
                <tbody>
                  {[...d.decisions].reverse().map((x, i) => (
                    <tr key={`${x.at}-${i}`} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3 pl-5 text-[12.5px] text-ink-3 tabular">
                        <Time t={x.at} format="seconds" />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-[13px]">{x.action.label}</div>
                        <div className="flex items-center gap-1.5">
                          <Method method={x.action.method} />
                          <Mono className="text-[11.5px] text-ink-3">{x.action.path}</Mono>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <RiskTag risk={x.action.risk} />
                      </td>
                      <td className="py-2.5 pr-5 pl-3 text-right">
                        <OutcomeTag outcome={x.outcome} />
                        <Mono className="mt-1 block text-[11px] text-ink-4">{x.policy}</Mono>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No agent actions">{s.verdict === "agent" ? "The agent has not acted yet." : "Nothing in this session was driven by an agent."}</Empty>
          )}
        </Card>
      </div>
    </Page>
  );
}
