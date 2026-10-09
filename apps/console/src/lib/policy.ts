import type { ActionDef, Outcome, Tier } from "./types";

export interface PolicyDecision {
  outcome: Outcome;
  policy: string;
  /** What the agent pays for this action, in millionths of a dollar, when the outcome is `bill`. */
  price?: number;
}

/**
 * The default policy pack from the blueprint, evaluated in observe mode: the console records what would have
 * happened to each agent action without enforcing anything.
 *
 * `price` is what the site charges agents for this action (src/lib/pricing.ts). For a recognised or verified agent it
 * turns a go-ahead, or a request for access, into `bill`: paying is the access. It never overrides an action the
 * person must approve (`ask`) or one that is refused, and people, undecided sessions and unknown automation are never
 * billed.
 */
export function decide(tier: Tier, action: ActionDef, price?: number | null): PolicyDecision {
  const d = baseDecision(tier, action);
  if (price && price > 0 && (tier === "verified" || tier === "recognised") && (d.outcome === "admit" || d.outcome === "request_access")) {
    return { outcome: "bill", policy: `pricing/${action.id}`, price };
  }
  return d;
}

function baseDecision(tier: Tier, action: ActionDef): PolicyDecision {
  if (tier === "human") return { outcome: "admit", policy: "people/role" };
  if (action.scope === "delete") return { outcome: "refuse", policy: "default/delete-people-only" };

  // Undecided means too little evidence either way, not unknown automation: low-risk actions go ahead and the
  // rest ask the person, who can confirm with a passkey that no agent can approve.
  if (tier === "unknown") {
    return action.scope === "view" || action.risk === "low"
      ? { outcome: "admit", policy: "default/undecided-low-risk" }
      : { outcome: "ask", policy: "default/undecided-ask" };
  }

  if (tier === "unknown-automation") {
    return action.scope === "view"
      ? { outcome: "slow", policy: "default/unknown-slow" }
      : { outcome: "refuse", policy: "default/unknown-read-only" };
  }

  if (tier === "verified") {
    if (action.scope === "pay" || action.scope === "settings") return { outcome: "ask", policy: "default/high-risk-passkey" };
    return { outcome: "admit", policy: "default/verified" };
  }

  // Recognised by behaviour: reading is fine, exporting needs the person's approval, writes need them to co-sign.
  switch (action.scope) {
    case "view":
      return { outcome: "admit", policy: "default/view-open" };
    case "export":
      return { outcome: "request_access", policy: "default/export-needs-approval" };
    case "edit":
    case "invite":
    case "send":
      return { outcome: "ask", policy: "default/writes-co-sign" };
    default:
      return { outcome: "refuse", policy: "default/high-risk-verified-only" };
  }
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  admit: "Allow",
  slow: "Slow",
  request_access: "Ask for access",
  ask: "Ask the person",
  reroute: "Reroute",
  bill: "Bill",
  refuse: "Block",
};
