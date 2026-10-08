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

export function decide(rec: Pick<SensorRecord, "observations" | "rules" | "jev">): Decision | null {
  const rules = rec.rules;
  if (rules?.tier === "verified") {
    return { verdict: "agent", tier: "verified", driverId: rules.driverId, confidence: 1, decidedBy: "signature" };
  }
  const exact = exactMatch(rec);
  if (exact) {
    // The match proves an agent; markers like navigator.webdriver do not say which, so Jev names it when it can.
    const driverId = (rec.jev && namedDriver(rec.jev)) ?? exact.driverId ?? (rules?.verdict === "agent" ? rules.driverId : null);
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
