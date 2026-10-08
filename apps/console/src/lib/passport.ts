import { DRIVERS } from "@observe/sensor";
import { ensureDriver } from "./catalog";
import { summarise } from "./generate";
import { namedDriver, toVerdict } from "./jev-questions";
import type { SensorRecord } from "./store";
import type { DecidedBy, Tier, Verdict } from "./types";

/**
 * Settles a sensor session's verdict from what we know, strongest source first:
 * 1. a signed passport (verified at the edge or by a handshake),
 * 2. an exact match the sensor saw on the page (navigator.webdriver, a framework global, an agent overlay),
 * 3. Jev's judgement of the session's behaviour,
 * 4. the sensor's in-browser rules, as a fallback while Jev has not answered or is unavailable.
 */

interface Decision {
  verdict: Verdict;
  tier: Tier;
  driverId: string | null;
  confidence: number;
  decidedBy: DecidedBy;
}

/** The first decisive observation, if any: an exact match needs no judgement. */
export function exactMatch(rec: Pick<SensorRecord, "observations">): { label: string; driverId: string | null } | null {
  for (const o of rec.observations.values()) if (o.decisive) return { label: o.label, driverId: o.drivers[0] ?? null };
  return null;
}

/** Products and the library each drives the browser through (Chrome DevTools MCP → Puppeteer, WebdriverIO → ChromeDriver). */
const BUILT_ON = new Map(DRIVERS.flatMap((d) => (d.builtOn ? [[d.id, d.builtOn] as const] : [])));

/**
 * A product shows its library's markers as well as its own, so Jev or the first exact match can name the library.
 * When a decisive observation names a product built on that library, name the product.
 */
export function preferProduct(driverId: string | null, observations: SensorRecord["observations"]): string | null {
  if (!driverId) return null;
  for (const o of observations.values()) {
    if (!o.decisive) continue;
    const product = o.drivers.find((d) => BUILT_ON.get(d) === driverId);
    if (product) return product;
  }
  return driverId;
}

export function decide(rec: Pick<SensorRecord, "observations" | "rules" | "jev">): Decision | null {
  const rules = rec.rules;
  if (rules?.tier === "verified") {
    return { verdict: "agent", tier: "verified", driverId: rules.driverId, confidence: 1, decidedBy: "signature" };
  }
  const exact = exactMatch(rec);
  if (exact) {
    // The match proves an agent; markers like navigator.webdriver do not say which, so Jev names it when it can.
    const named = (rec.jev && namedDriver(rec.jev)) ?? exact.driverId ?? (rules?.verdict === "agent" ? rules.driverId : null);
    const driverId = preferProduct(named, rec.observations);
    return { verdict: "agent", tier: driverId ? "recognised" : "unknown-automation", driverId, confidence: 0.99, decidedBy: "exact-match" };
  }
  if (rec.jev) return { ...toVerdict(rec.jev), decidedBy: "jev" };
  if (rules) {
    const confidence = rules.verdict === "agent" ? rules.agentProbability : rules.verdict === "human" ? 1 - rules.agentProbability : 0.5;
    return { verdict: rules.verdict, tier: rules.tier, driverId: rules.verdict === "agent" ? rules.driverId : null, confidence, decidedBy: "rules" };
  }
  return null;
}

/** Apply the current decision to the session and to the events recorded before a verdict existed. */
export function resolvePassport(rec: SensorRecord): void {
  const d = decide(rec);
  if (!d) return;
  const s = rec.session;
  s.verdict = d.verdict;
  s.tier = d.tier;
  s.driverId = d.verdict === "agent" && d.driverId ? ensureDriver(d.driverId).id : null;
  s.confidence = d.confidence;
  s.decidedBy = d.decidedBy;
  // Events recorded before a verdict belong to whoever it settles on.
  if (d.verdict !== "unknown") for (const e of rec.events) if (e.driver === "unknown") e.driver = d.verdict;
  Object.assign(s, summarise(rec.events));
}
