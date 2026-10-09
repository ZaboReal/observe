import Link from "next/link";
import type { Metadata } from "next";

import { Page, PageHeader, Panel, Pill, buttonClass } from "@/components/ui";
import { TIER_LABEL, num } from "@/lib/format";
import { currentSite } from "@/lib/current-site";
import { dbWritable } from "@/lib/db";
import { formatMinutes, formatPrice, formatTotal } from "@/lib/money";
import { pricingRows } from "@/lib/pricing-view";
import { syncStore } from "@/lib/sync";
import type { Scope, Tier } from "@/lib/types";
import { type RuleDecision, ruleEntries, ruleRows, ruleSummary } from "@/lib/views";

import { PricingForm } from "./pricing-form";
import { RulesGrid, type RuleRowView, type RuleView } from "./rules-grid";

export const metadata: Metadata = { title: "Rules" };
export const dynamic = "force-dynamic";

const ABOUT: Record<Tier, string> = {
  verified: "Signs its requests, so we know exactly which agent it is.",
  recognised: "Named from how it clicks and types, and the marks it leaves on the page.",
  "unknown-automation": "Clearly automated, but no known agent matches.",
  unknown: "Not decided yet.",
  human: "People driving their own session. Your own roles and permissions apply.",
};

/** The group a named agent falls back on, for the line under its name. */
const GROUP_NAME: Partial<Record<Tier, string>> = { verified: "Verified agents", recognised: "Recognised agents" };

export default async function RulesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await syncStore();
  const site = await currentSite();
  const want = (await searchParams).agent;
  const entries = ruleEntries(site.id);
  const selected = entries.find((e) => e.id === want) ?? entries[0]!;
  const rows = ruleRows(selected.tier, site.id, selected.id);
  const isPeople = selected.tier === "human";
  const pricing = pricingRows(site.id);
  const editable = site.stored && dbWritable;
  // The demo and sites without a database keep the rules they have; people keep their own roles.
  const rulesEditable = editable && !site.demo && !isPeople;
  // A named agent follows its group (Recognised agents, Verified agents) wherever it has no rule of its own.
  const group = selected.id.startsWith("any-") ? undefined : GROUP_NAME[selected.tier];
  // Priced actions this agent pays for instead (agent pricing, below): a price applies where the rule lets a
  // recognised or verified agent go ahead or ask for access (src/lib/policy.ts).
  const pays = (scope: Scope, d: RuleDecision): string | null => {
    if (selected.tier !== "verified" && selected.tier !== "recognised") return null;
    if (d.outcome !== "admit" && d.outcome !== "request_access") return null;
    const priced = pricing.rows.filter((p) => p.scope === scope && p.price);
    if (!priced.length) return null;
    return `${d.choice === "allow" ? "Pays" : "Or pays"}: ${priced.map((p) => `${p.label} ${formatPrice(p.price!)}`).join(" · ")}`;
  };
  const view = (scope: Scope, d: RuleDecision): RuleView => ({ choice: d.choice, policy: d.policy, note: d.note, pays: pays(scope, d) });
  const grid: RuleRowView[] = rows.map((r) => ({
    scope: r.scope,
    label: r.label,
    examples: r.examples.join(", "),
    locked: r.locked,
    own: r.own && r.rule ? r.rule.choice : null,
    base: view(r.scope, r.base),
    options: rulesEditable && r.options ? { allow: view(r.scope, r.options.allow), ask: view(r.scope, r.options.ask), never: view(r.scope, r.options.never) } : null,
  }));
  const readOnlyNote = isPeople ? null : site.demo ? "The demo's rules are fixed. Add your own site to set rules for it." : rulesEditable ? null : "Rules are set on the deployed console.";

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

      <div className="grid grid-cols-1 overflow-hidden rounded-[20px] bg-sheet shadow-sheet md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-line bg-side p-3 md:border-r md:border-b-0">
          <div className="eyebrow px-2 pt-1 pb-2">Agents · {site.name}</div>
          {/* Phones: a row of agents to swipe through; wider screens: the list down the side. */}
          <ul className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 md:mx-0 md:block md:space-y-1 md:overflow-visible md:px-0 md:pb-0">
            {entries.map((e) => {
              const on = e.id === selected.id;
              const summary = ruleSummary(e.tier, site.id, e.id);
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
              {rulesEditable && group ? ` Rows you haven't changed follow ${group}.` : null}
            </p>
            {readOnlyNote && <p className="mt-1 text-[12px] text-ink-3">{readOnlyNote}</p>}
          </div>

          <RulesGrid key={selected.id} rows={grid} subject={selected.id} subjectName={selected.name} siteName={site.name} />
        </div>
      </div>

      <Panel
        className="mt-3"
        flush
        title="Agent billing"
        description="Charge agents for what they use: per action, per hour of agent time, or per session. Your server gets the price with each decision, and every charge is on record in Activity."
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 pb-3">
          <span className="text-[24px] leading-none font-semibold tracking-[-0.025em] tabular">{formatTotal(pricing.billing.total)}</span>
          <span className="text-[12.5px] text-ink-3">
            {["billed to agents this week", pricing.billing.actionCount ? `${num(pricing.billing.actionCount)} ${pricing.billing.actionCount === 1 ? "action" : "actions"}` : null, pricing.billing.time ? formatMinutes(pricing.billing.minutes) : null, pricing.billing.sessionCount ? `${num(pricing.billing.sessionCount)} ${pricing.billing.sessionCount === 1 ? "session" : "sessions"}` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <PricingForm
          rows={pricing.rows}
          rates={pricing.rates}
          billing={{ time: pricing.billing.time, minutes: pricing.billing.minutes, sessions: pricing.billing.sessions, sessionCount: pricing.billing.sessionCount }}
          editable={editable}
          note={site.demo ? "Example prices on the demo site." : editable ? null : "Prices are set on the deployed console."}
        />
      </Panel>

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
        Every agent starts from the default rules. A rule you set for one agent comes before the rule for its group, and Reset removes it, so the group&apos;s rule or the default applies again.
        Every check uses the rules as they are now: the decisions in Activity, the sessions list and your server&apos;s calls to /api/v1/decide. In observe mode nothing is blocked yet, so you can
        see what would have been allowed, asked or blocked before switching anything on.
      </p>
    </Page>
  );
}
