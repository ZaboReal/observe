import "server-only";

import { agentBilling, type AgentBilling } from "./billing";
import { ACTIONS } from "./catalog";
import { DAY } from "./generate";
import { actionFor } from "./ingest";
import { decide } from "./policy";
import { priceFor, rateFor, sitePrices } from "./pricing";
import { siteById } from "./site";
import { store } from "./store";
import type { ActionDef, Scope } from "./types";

/** Which agents a price on this action would reach, given the default rules. */
export type PriceReach = "agents" | "verified" | "never";

export interface PricingRow {
  id: string;
  label: string;
  scope: Scope;
  /** Millionths of a dollar, or null when free. */
  price: number | null;
  reach: PriceReach;
  /** Agent actions of this kind in the last 7 days. */
  agentActions: number;
  /** What they were billed (or would have been, in observe mode), millionths of a dollar. */
  billed: number;
}

/** A price never reaches past the rules: work out which agent tiers it applies to (src/lib/policy.ts). */
export function priceReach(action: ActionDef): PriceReach {
  const billed = (tier: "recognised" | "verified") => decide(tier, action, 1).outcome === "bill";
  if (billed("recognised")) return "agents";
  if (billed("verified")) return "verified";
  return "never";
}

export interface PricingView {
  rows: PricingRow[];
  /** Per hour of agent time and per agent session, millionths of a dollar. */
  rates: { hour: number | null; session: number | null };
  /** Everything agents were billed this week: actions, time and sessions. */
  billing: AgentBilling;
}

/** The Rules page's billing panel: rates, the site's actions (seen this week, or already priced) and what agents were billed. */
export function pricingRows(siteId: string, now = Date.now()): PricingView {
  const site = siteById(siteId);
  const actions = new Map<string, ActionDef>();
  const agentActions = new Map<string, number>();
  const billed = new Map<string, number>();

  for (const s of store.sessions(now - 7 * DAY, now, now, siteId)) {
    for (const e of store.events(s, now)) {
      if (!e.action) continue;
      actions.set(e.action.id, e.action);
      if (s.verdict !== "agent" || e.driver !== "agent") continue;
      agentActions.set(e.action.id, (agentActions.get(e.action.id) ?? 0) + 1);
      const d = decide(s.tier, e.action, priceFor(siteId, e.action.id));
      if (d.price) {
        billed.set(e.action.id, (billed.get(e.action.id) ?? 0) + d.price);
      }
    }
  }
  if (site?.demo) for (const a of ACTIONS) if (!actions.has(a.id)) actions.set(a.id, a);
  for (const id of sitePrices(siteId).keys()) {
    if (!actions.has(id)) actions.set(id, actionFor(id, "/"));
  }

  const rows = [...actions.values()].map((a) => ({
    id: a.id,
    label: a.label,
    scope: a.scope,
    price: priceFor(siteId, a.id),
    reach: priceReach(a),
    agentActions: agentActions.get(a.id) ?? 0,
    billed: billed.get(a.id) ?? 0,
  }));
  // Priced first, highest earners on top, then the busiest, then by name; actions no price can reach last.
  rows.sort(
    (a, b) =>
      Number(a.reach === "never") - Number(b.reach === "never") ||
      Number(!a.price) - Number(!b.price) ||
      b.billed - a.billed ||
      b.agentActions - a.agentActions ||
      a.label.localeCompare(b.label),
  );
  return { rows, rates: { hour: rateFor(siteId, "hour"), session: rateFor(siteId, "session") }, billing: agentBilling(siteId, now - 7 * DAY, now, now) };
}
