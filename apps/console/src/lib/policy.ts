import type { ActionDef, Outcome, Tier } from "./types";

/**
 * The default policy pack from the blueprint, evaluated in observe mode: the console records what
 * would have happened to each agent action without enforcing anything.
 */
export function decide(tier: Tier, action: ActionDef): { outcome: Outcome; policy: string } {
  if (tier === "human") return { outcome: "admit", policy: "people/role" };
  if (action.scope === "delete") return { outcome: "refuse", policy: "default/delete-people-only" };

  if (tier === "unknown-automation" || tier === "unknown") {
    return action.scope === "view"
      ? { outcome: "slow", policy: "default/unknown-slow" }
      : { outcome: "refuse", policy: "default/unknown-read-only" };
  }

  if (tier === "verified") {
    if (action.scope === "pay" || action.scope === "settings") return { outcome: "ask", policy: "default/high-risk-passkey" };
    return { outcome: "admit", policy: "default/verified" };
  }

  // Recognised by behaviour: reading is fine, exporting needs a visa, writes need the person to co-sign.
  switch (action.scope) {
    case "view":
      return { outcome: "admit", policy: "default/view-open" };
    case "export":
      return { outcome: "request_visa", policy: "default/export-needs-visa" };
    case "edit":
    case "invite":
    case "send":
      return { outcome: "ask", policy: "default/writes-co-sign" };
    default:
      return { outcome: "refuse", policy: "default/high-risk-verified-only" };
  }
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  admit: "Admit",
  slow: "Slow",
  request_visa: "Request visa",
  ask: "Ask the person",
  reroute: "Reroute",
  bill: "Bill",
  refuse: "Refuse",
};
