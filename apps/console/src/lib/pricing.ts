/**
 * Agent pricing: a site can charge agents for an action while people use it for free. A price applies where the
 * rules would let a recognised or verified agent go ahead or ask for access (src/lib/policy.ts). It never overrides
 * an action the person must approve or one that is refused, and undecided sessions and unknown automation are never
 * billed.
 *
 * Prices live in the database (`observe.prices`, loaded with the sites by `syncStore`). Amounts are in millionths of
 * a dollar so per-request prices like $0.002 are exact. The demo site has fixed prices so it shows what pricing earns.
 */
import type { StoredPrice, StoredRate } from "./db";
import { DEMO_SITE_ID } from "./site";

export { MICRO, formatPrice, formatTotal, parsePrice } from "./money";

/** Ledgerline, the demo: reading is cheap, bulk exports cost more. */
const DEMO_PRICES: Record<string, number> = {
  search_invoices: 2_000,
  view_report: 10_000,
  view_customer: 10_000,
  export_report: 250_000,
  export_invoices: 250_000,
  export_customers: 500_000,
};

/** The demo's time and session rates. */
const DEMO_RATES: Record<RateUnit, number> = { hour: 1_500_000, session: 20_000 };

/** Billing by time and by session: per hour an agent drives a session, and per agent session. */
export type RateUnit = "hour" | "session";

// On globalThis so a dev-server reload keeps what the last sync loaded.
const g = globalThis as unknown as { __observePrices?: Map<string, Map<string, number>>; __observeRates?: Map<string, Partial<Record<RateUnit, number>>> };
g.__observePrices ??= new Map();
g.__observeRates ??= new Map();

/** Replace the database's prices (called by `syncStore`). */
export function setStoredPrices(rows: StoredPrice[]): void {
  const bySite = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const amount = Number(r.amount_micro);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    let m = bySite.get(r.site);
    if (!m) bySite.set(r.site, (m = new Map()));
    m.set(r.action_id, amount);
  }
  g.__observePrices = bySite;
}

/** Record a price this server just wrote, so the page shows it before the next sync. Null removes it. */
export function setLocalPrice(siteId: string, actionId: string, micro: number | null): void {
  let m = g.__observePrices!.get(siteId);
  if (!m) g.__observePrices!.set(siteId, (m = new Map()));
  if (micro && micro > 0) m.set(actionId, micro);
  else m.delete(actionId);
}

/** Every priced action of a site, in millionths of a dollar. */
export function sitePrices(siteId: string): Map<string, number> {
  if (siteId === DEMO_SITE_ID) return new Map(Object.entries(DEMO_PRICES));
  return new Map(g.__observePrices!.get(siteId) ?? []);
}

/** What an agent pays for this action on this site, in millionths of a dollar, or null when it is free. */
export function priceFor(siteId: string, actionId: string): number | null {
  if (siteId === DEMO_SITE_ID) return DEMO_PRICES[actionId] ?? null;
  return g.__observePrices!.get(siteId)?.get(actionId) ?? null;
}

/** Replace the database's time and session rates (called by `syncStore`). */
export function setStoredRates(rows: StoredRate[]): void {
  const bySite = new Map<string, Partial<Record<RateUnit, number>>>();
  for (const r of rows) {
    const amount = Number(r.amount_micro);
    if ((r.unit !== "hour" && r.unit !== "session") || !Number.isFinite(amount) || amount <= 0) continue;
    bySite.set(r.site, { ...bySite.get(r.site), [r.unit]: amount });
  }
  g.__observeRates = bySite;
}

/** Record a rate this server just wrote, so the page shows it before the next sync. Null removes it. */
export function setLocalRate(siteId: string, unit: RateUnit, micro: number | null): void {
  const rates = { ...g.__observeRates!.get(siteId) };
  if (micro && micro > 0) rates[unit] = micro;
  else delete rates[unit];
  g.__observeRates!.set(siteId, rates);
}

/** What an agent pays per hour of driving, or per session, on this site, in millionths of a dollar; null when free. */
export function rateFor(siteId: string, unit: RateUnit): number | null {
  if (siteId === DEMO_SITE_ID) return DEMO_RATES[unit];
  return g.__observeRates!.get(siteId)?.[unit] ?? null;
}
