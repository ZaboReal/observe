import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { ReasonBars } from "@/components/charts";
import { LiveToggle } from "@/components/live";
import { Recheck } from "@/components/recheck";
import { SessionTrack } from "@/components/session-track";
import { Time } from "@/components/time";
import { Avatar, Empty, LiveDot, Method, Mono, OutcomePill, Page, Panel, RiskTag, ShareBar, Who } from "@/components/ui";
import { VisitTabs } from "@/components/visit-tabs";
import { KIND_LABEL, TIER_LABEL, accountText, ago, duration, num, personOf, personText } from "@/lib/format";
import { sessionBill } from "@/lib/billing";
import { agentShare } from "@/lib/jev-questions";
import { formatMinutes, formatPrice, formatTotal } from "@/lib/money";
import { sessionDetail, sessionVisit } from "@/lib/queries";
import { currentSite } from "@/lib/current-site";
import { syncStore } from "@/lib/sync";
import { allowedScopes } from "@/lib/views";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const DECIDED_BY = { signature: "Signed requests", "exact-match": "A marker on the page", jev: "Our model, from how it was driven", rules: "The sensor's own rules" } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await syncStore();
  const site = await currentSite();
  const d = sessionDetail(site.id, (await params).id);
  return { title: d ? `${personText(d.row.email)} · Session` : "Session" };
}

export default async function SessionPage({ params }: Props) {
  await syncStore();
  const site = await currentSite();
  const d = sessionDetail(site.id, (await params).id);
  if (!d) notFound();
  const { session: s, row, events, now } = d;
  const visit = sessionVisit(site.id, s, now);
  const bill = sessionBill(site.id, s, now);
  const person = personOf(row.email);
  const account = site.anonymous ? null : accountText(s.accountId, d.account?.name ?? s.accountId);

  const lastEvent = events[events.length - 1];
  const endAt = d.live ? now : s.startedAt + (lastEvent?.t ?? 0) + 20_000;
  const span = Math.max(1, row.lastAt - s.startedAt);
  const firstSensitive = d.decisions.find((x) => x.action.scope !== "view");
  const decision = d.decision;
  const agentName = d.driver?.name ?? "Unknown automation";

  const decidedBy = s.decidedBy ? DECIDED_BY[s.decidedBy] : s.source === "sensor" ? "The sensor" : s.tier === "verified" ? "Signed requests" : "How it was driven";
  const recognisedBy =
    s.verdict === "unknown"
      ? "Not enough evidence yet"
      : s.verdict === "human"
        ? "How they click and type"
        : s.tier === "verified" || s.decidedBy === "signature"
          ? "Its signed requests"
          : s.decidedBy === "exact-match"
            ? "A marker it leaves on the page"
            : s.tier === "unknown-automation"
              ? "Clearly automated; no known product matches"
              : "How it clicks and types";
  const allowed = allowedScopes(s.tier, site.id, s.driverId);
  const allowedTo =
    s.verdict === "human" ? "Whatever their role allows" : s.verdict === "unknown" ? "Decided once it is clear who is driving" : allowed.length ? allowed.join(", ") : "Nothing without asking first";
  const personLine = `${person.label}${person.device ? ` ${person.device}` : ""}${account ? `, ${account}` : ""}`;

  const moments = [
    { label: "Started", at: s.startedAt, note: { agent: "by an agent", human: "by a person", unknown: "driver not decided yet" }[events[0]?.driver ?? "unknown"] },
    ...(s.handoffAt !== null ? [{ label: `${agentName} took over`, at: s.startedAt + s.handoffAt, note: "how it was driven changed", strong: true }] : []),
    ...(firstSensitive ? [{ label: "First sensitive action", at: firstSensitive.at, note: firstSensitive.action.label }] : []),
    { label: d.live ? "Last activity" : "Ended", at: row.lastAt, note: d.live ? ago(row.lastAt, now) : `after ${duration(row.lastAt - s.startedAt)}` },
  ];

  return (
    <Page>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/sessions" className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
          <ArrowLeft size={14} /> Sessions
        </Link>
        {d.live && <LiveToggle />}
      </div>

      <header className="mb-6">
        <div className="eyebrow mb-2.5">Session</div>
        <h1 className="text-[26px] leading-[1.1] font-medium tracking-[-0.03em] break-all md:text-[30px]">
          {person.label}
          {person.device && <span className="ml-2 font-mono text-[0.7em] font-normal tracking-normal text-ink-3">{person.device}</span>}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
          {account && (
            <Link href={`/sessions?account=${s.accountId}`} className="hover:text-ink">
              {account}
            </Link>
          )}
          <span>{s.device.replace(/\bd_([0-9a-z]{6})[0-9a-z]+/i, "$1")}</span>
          <span>
            Started <Time t={s.startedAt} format="datetime" />
          </span>
          <span>{duration(row.lastAt - s.startedAt)}</span>
          <Mono className="text-ink-3">{s.id}</Mono>
        </div>
      </header>

      {visit.length > 1 && <VisitTabs tabs={visit} current={s.id} />}

      <div className="grid items-start gap-3 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
          {/* Who is driving, at a glance (the site's session card). */}
          <section className="rounded-2xl bg-sheet px-[18px] pt-4 pb-[18px] shadow-sheet">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Who is driving</span>
              {d.live ? (
                <span className="flex items-center gap-1.5 text-[12px] text-green">
                  <LiveDot small /> Live
                </span>
              ) : (
                <span className="text-[12px] text-ink-3">Ended</span>
              )}
            </div>
            <div className="my-3.5 flex items-center gap-3 border-b border-line pb-3.5">
              <Avatar name={s.verdict === "agent" ? agentName : ""} provider={d.driver?.provider} verdict={s.verdict} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{s.verdict === "agent" ? agentName : s.verdict === "human" ? "A person" : "Undecided"}</div>
                <div className="truncate text-[12px] text-ink-2">
                  {s.verdict === "agent" ? (
                    <>
                      {d.driver ? `${d.driver.provider} · ` : ""}acting for {personText(row.email)}
                    </>
                  ) : s.verdict === "human" ? (
                    `${personText(row.email)}, at the keyboard`
                  ) : (
                    "Too little evidence to call yet"
                  )}
                </div>
              </div>
              <span className="font-mono text-[14px] font-medium">{s.verdict === "unknown" ? "—" : `${Math.round(s.confidence * 100)}%`}</span>
            </div>

            <div className={`relative ${s.handoffAt !== null ? "mb-7" : "mb-6"}`} aria-hidden="true">
              <div className="flex h-1.5 overflow-hidden rounded-full bg-bg-2">
                {s.handoffAt !== null ? (
                  <>
                    <span className="bg-people" style={{ width: `${Math.min(96, Math.max(4, (s.handoffAt / span) * 100))}%` }} />
                    <span className="ml-[2px] flex-1 bg-agents" />
                  </>
                ) : (
                  <span className={`flex-1 ${s.verdict === "agent" ? "bg-agents" : s.verdict === "human" ? "bg-people" : "bg-undecided"}`} />
                )}
              </div>
              <span
                className={`absolute top-2.5 font-mono text-[11px] whitespace-nowrap text-ink-2 ${s.handoffAt !== null ? "-translate-x-1/2" : "left-0"}`}
                style={s.handoffAt !== null ? { left: `${Math.min(70, Math.max(30, (s.handoffAt / span) * 100))}%` } : undefined}
              >
                {s.handoffAt !== null ? (
                  <>
                    agent took over <Time t={s.startedAt + s.handoffAt} />
                  </>
                ) : s.verdict === "agent" ? (
                  "agent from the start"
                ) : s.verdict === "human" ? (
                  "a person throughout"
                ) : (
                  "not decided yet"
                )}
              </span>
            </div>

            <dl className="grid grid-cols-[104px_minmax(0,1fr)] gap-x-2.5 gap-y-2 text-[13px]">
              <dt className="text-ink-3">Recognised by</dt>
              <dd>{recognisedBy}</dd>
              <dt className="text-ink-3">Allowed to</dt>
              <dd>{allowedTo}</dd>
              <dt className="text-ink-3">{s.verdict === "agent" ? "Acting for" : person.device ? "Visitor" : "Signed in as"}</dt>
              <dd className="break-words">{personLine}</dd>
              {s.verdict === "agent" && d.driver && (
                <>
                  <dt className="text-ink-3">Kind</dt>
                  <dd>
                    {KIND_LABEL[d.driver.kind]} · {TIER_LABEL[s.tier]}
                  </dd>
                </>
              )}
            </dl>
          </section>

          <Panel title="How it was decided" description="What settled who is driving, and how sure we are">
            <dl className="grid gap-2.5 text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-3">Decided by</dt>
                <dd className="text-right">{decidedBy}</dd>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-3">Confidence</dt>
                  <dd className="font-medium tabular">{s.verdict === "unknown" ? "—" : `${Math.round(s.confidence * 100)}%`}</dd>
                </div>
                <ShareBar className="mt-2" value={s.verdict === "unknown" ? 0 : s.confidence} tone={s.verdict === "agent" ? "agents" : s.verdict === "human" ? "people" : "muted"} />
              </div>
              {decision?.exact && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-ink-3">Exact match</dt>
                  <dd className="text-right">{decision.exact.label}</dd>
                </div>
              )}
              {decision && (
                <div className="border-t border-line pt-2.5">
                  {decision.jev ? (
                    <>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-ink-3">Our model</dt>
                        <dd className="tabular">{Math.round(agentShare(decision.jev) * 100)}% an agent</dd>
                      </div>
                      <ul className="mt-2 grid gap-1.5">
                        {decision.jev.candidates.slice(0, 3).map((c) => (
                          <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_64px_36px] items-center gap-2.5 text-[12.5px] text-ink-2">
                            <span className="truncate">{c.name}</span>
                            <ShareBar value={c.p} tone={c.id === "human" ? "people" : "agents"} />
                            <span className="text-right tabular">{Math.round(c.p * 100)}%</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="font-mono text-[11px] text-ink-3">
                          {decision.jev.latencyMs} ms · read {decision.jev.actionsSeen} actions
                        </p>
                        {s.source === "sensor" && <Recheck sessionId={s.id} />}
                      </div>
                    </>
                  ) : (
                    <p className="text-ink-3">{decision.jevError ? "Our model is unavailable right now; the sensor's own rules decide meanwhile." : "Waiting for our model"}</p>
                  )}
                </div>
              )}
              {decision?.rules && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-3">Sensor rules said</dt>
                  <dd className="text-right">
                    {decision.rules.verdict === "human" ? "a person" : decision.rules.verdict === "unknown" ? "undecided" : "an agent"}
                    {decision.rules.driverName ? ` · ${decision.rules.driverName}` : ""}
                  </dd>
                </div>
              )}
              {decision?.label && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-3">Test label</dt>
                  <dd>
                    <Mono>{decision.label}</Mono>
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-4 border-t border-line pt-3.5">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="eyebrow">Evidence</span>
                <span className="font-mono text-[11px] text-ink-3">← person · agent →</span>
              </div>
              {d.reasons.length ? <ReasonBars reasons={d.reasons} /> : <p className="text-[13px] text-ink-3">No evidence reported yet.</p>}
            </div>
          </Panel>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
          <Panel title="Who drove, and when" description={`${num(events.filter((e) => e.type !== "page").length)} actions across ${num(events.filter((e) => e.type === "page").length)} page views`}>
            <div className="pt-2">
              {events.length > 1 ? (
                <SessionTrack events={events} startedAt={s.startedAt} endAt={endAt} handoffAt={s.handoffAt} driverName={d.driver?.name ?? null} />
              ) : (
                <Empty title="Waiting for activity">The sensor has not reported any actions yet.</Empty>
              )}
            </div>
            <ol className="-mx-4 mt-4 -mb-4 flex flex-wrap gap-px overflow-hidden rounded-b-[14px] border-t border-line bg-line">
              {moments.map((m) => (
                <li key={m.label} className="min-w-[150px] flex-1 basis-0 bg-sheet px-4 py-3.5">
                  <div className={`truncate text-[13px] ${m.strong ? "font-medium" : "text-ink-2"}`}>{m.label}</div>
                  <div className="mt-0.5 font-mono text-[12.5px] tabular">
                    <Time t={m.at} format="seconds" />
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-ink-3">{m.note}</div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel
            title="What the rules would do"
            description="Each agent action, and what your rules decided. Observe mode: logged, nothing blocked."
            action={
              d.decisions.length ? (
                <Link href="/rules" className="shrink-0 pt-0.5 text-[12.5px] text-ink-3 hover:text-ink">
                  Rules
                </Link>
              ) : undefined
            }
            flush
          >
            {d.decisions.length ? (
              <div className="overflow-x-auto">
                <table className="tbl min-w-[560px] text-[13px]">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Risk</th>
                      <th className="text-right">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...d.decisions].reverse().map((x, i) => (
                      <tr key={`${x.at}-${i}`}>
                        <td className="font-mono text-[12px] whitespace-nowrap text-ink-3 tabular">
                          <Time t={x.at} format="seconds" />
                        </td>
                        <td>
                          <div>{x.action.label}</div>
                          <div className="flex items-center gap-1.5">
                            <Method method={x.action.method} />
                            <Mono className="text-[11.5px] text-ink-3">{x.action.path}</Mono>
                          </div>
                        </td>
                        <td>
                          <RiskTag risk={x.action.risk} />
                        </td>
                        <td className="text-right">
                          <OutcomePill outcome={x.outcome} />
                          <Mono className="mt-1 block text-[11px] text-ink-3">{x.policy}</Mono>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No agent actions">{s.verdict === "agent" ? "The agent has not done anything sensitive yet." : "Nothing in this session was driven by an agent."}</Empty>
            )}
            {bill.total > 0 && (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line px-4 py-3">
                <span className="text-[13px] text-ink-2">
                  Billed to the agent{" "}
                  <span className="text-ink-3">
                    ·{" "}
                    {[
                      bill.time ? `${formatMinutes(bill.minutes)} of agent time ${formatPrice(bill.time)}` : null,
                      bill.session ? `session ${formatPrice(bill.session)}` : null,
                      bill.actionCount ? `${num(bill.actionCount)} ${bill.actionCount === 1 ? "action" : "actions"} ${formatPrice(bill.actions)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="font-mono text-[15px] font-medium text-green tabular">{formatTotal(bill.total)}</span>
              </div>
            )}
          </Panel>

          <Panel title="Pages" description="Visits, and who drove each one" flush>
            <ul>
              {d.activity.map((a, i) => (
                <li key={`${a.route}-${a.at}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto_72px] items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
                  <div className="min-w-0">
                    <Mono className="block truncate text-[12.5px]">{a.route}</Mono>
                    <div className="mt-0.5 font-mono text-[11.5px] text-ink-3">
                      <Time t={a.at} />
                    </div>
                  </div>
                  <Who verdict={a.driver} className="text-[12.5px]">
                    {a.driver === "agent" ? "Agent" : a.driver === "human" ? "Person" : "Undecided"}
                  </Who>
                  <div className="text-right text-[12.5px] text-ink-2 tabular">{a.actions ? `${a.actions} ${a.actions === 1 ? "action" : "actions"}` : "view"}</div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
