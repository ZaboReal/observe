import Link from "next/link";
import type { Metadata } from "next";
import { Lock } from "lucide-react";

import { Page, PageHeader, Pill, buttonClass } from "@/components/ui";
import { TIER_LABEL, num } from "@/lib/format";
import { currentSite } from "@/lib/current-site";
import { syncStore } from "@/lib/sync";
import type { Tier } from "@/lib/types";
import { type Choice, ruleEntries, ruleRows, ruleSummary } from "@/lib/views";

export const metadata: Metadata = { title: "Rules" };
export const dynamic = "force-dynamic";

const ABOUT: Record<Tier, string> = {
  verified: "Signs its requests, so we know exactly which agent it is.",
  recognised: "Named from how it clicks and types, and the marks it leaves on the page.",
  "unknown-automation": "Clearly automated, but no known agent matches.",
  unknown: "Not decided yet.",
  human: "People driving their own session. Your own roles and permissions apply.",
};

const CHOICES: { id: Choice; label: string; on: string }[] = [
  { id: "allow", label: "Allow", on: "text-green" },
  { id: "ask", label: "Ask", on: "text-amber" },
  { id: "never", label: "Never", on: "text-red" },
];

export default async function RulesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await syncStore();
  const site = await currentSite();
  const want = (await searchParams).agent;
  const entries = ruleEntries(site.id);
  const selected = entries.find((e) => e.id === want) ?? entries[0]!;
  const rows = ruleRows(selected.tier);
  const isPeople = selected.tier === "human";

  return (
    <Page>
      <PageHeader
        eyebrow="Rules"
        title={
          <>
            What agents <em>may do</em>
          </>
        }
        description={`The rules every agent action on ${site.host} is checked against. Observe mode: each decision is logged in Activity, and nothing is blocked yet.`}
        actions={
          <Link href="/activity" className={buttonClass("ghost")}>
            See decisions in Activity
          </Link>
        }
      />

      <div className="grid overflow-hidden rounded-[20px] bg-sheet shadow-sheet md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-line bg-side p-3 md:border-r md:border-b-0">
          <div className="eyebrow px-2 pt-1 pb-2">Agents · {site.name}</div>
          {/* Phones: a row of agents to swipe through; wider screens: the list down the side. */}
          <ul className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 md:mx-0 md:block md:space-y-1 md:overflow-visible md:px-0 md:pb-0">
            {entries.map((e) => {
              const on = e.id === selected.id;
              const summary = ruleSummary(e.tier);
              return (
                <li key={e.id} className="shrink-0 md:shrink">
                  <Link
                    href={`/rules?agent=${e.id}`}
                    scroll={false}
                    aria-current={on ? "true" : undefined}
                    className={`flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 transition-colors ${on ? "bg-sheet shadow-pill" : "max-md:bg-sheet/60 hover:bg-ink/[0.04]"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`who ${e.tier === "human" ? "person" : "agent"} max-w-full text-[13px] ${e.tier === "human" ? "" : "text-ink"}`}>
                        <span className="truncate">{e.name}</span>
                      </span>
                      <span className="hidden truncate pl-[15px] text-[11.5px] text-ink-3 md:block">
                        {[e.tier === "human" ? "Your roles" : e.tier === "unknown-automation" ? "Automated" : TIER_LABEL[e.tier], e.sessions ? `${num(e.sessions)} this week` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0">
                      <Pill tone={summary.tone}>{summary.label}</Pill>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="min-w-0 p-4 md:p-5">
          <div className="mb-2">
            <h2 className="text-[17px] font-medium tracking-[-0.01em]">{selected.name}</h2>
            <p className="mt-0.5 text-[13px] text-ink-2">
              {isPeople ? `What people may do on ${site.name}` : `What ${selected.id.startsWith("any-") ? "they" : "it"} may do on ${site.name}`}. {ABOUT[selected.tier]}
            </p>
          </div>

          <ul>
            {rows.map((r) => (
              <li key={r.scope} className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="text-[14px]">{r.label}</div>
                  <div className="truncate text-[12px] text-ink-3">
                    {r.note ? <span className={r.choice === "ask" ? "text-amber" : "text-ink-2"}>{r.note}. </span> : null}
                    {r.examples.join(", ")}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                  <span className={`inline-flex rounded-full bg-track p-[3px] text-[12px] text-ink-3 ${r.locked ? "opacity-75" : ""}`} aria-hidden="true">
                    {CHOICES.map((c) => (
                      <span key={c.id} className={`rounded-full px-2.5 py-[3px] ${c.id === r.choice ? `bg-sheet font-medium shadow-pill ${c.on}` : ""}`}>
                        {c.label}
                      </span>
                    ))}
                  </span>
                  <span className="sr-only">{CHOICES.find((c) => c.id === r.choice)!.label}</span>
                  <span className="flex items-center gap-1 font-mono text-[10.5px] text-ink-3" title={`Policy ${r.policy}`}>
                    {r.locked && (
                      <>
                        <Lock size={10} aria-hidden="true" /> Set by {site.name} ·{" "}
                      </>
                    )}
                    {r.policy}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {[
          { k: site.name, b: "Sets the limits for the product", t: `Rows marked "Set by ${site.name}" apply to every agent, whatever anyone else allows.` },
          { k: "Each person", b: "Approves their own agent", t: "Where a rule says Ask, the agent waits for the person it acts for." },
          { k: "The agent", b: "Stays inside what it was given", t: "Anything outside its access is refused, and logged against the agent and the person it acts for." },
        ].map((x) => (
          <div key={x.k} className="rounded-[14px] bg-tile px-4 py-3.5 shadow-ring">
            <div className="eyebrow">{x.k}</div>
            <div className="mt-1.5 text-[14px] font-medium">{x.b}</div>
            <p className="mt-1 text-[13px] leading-[1.55] text-ink-2">{x.t}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 max-w-3xl text-[12.5px] leading-[1.55] text-ink-3">
        These are the default rules, shown read-only. In observe mode every agent action is checked against them and the outcome is recorded, so you can see what would have been allowed, asked or
        blocked before switching anything on.
      </p>
    </Page>
  );
}
