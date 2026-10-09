import type { Choice, RuleChoice } from "./agent-rules";
import type { ActionDef, Outcome, Scope, Tier } from "./types";

export interface PolicyDecision {
  outcome: Outcome;
  policy: string;
  /** What the agent pays for this action, in millionths of a dollar, when the outcome is `bill`. */
  price?: number;
}

/** Tiers a site's agent rules apply to. People keep their own roles, and undecided sessions keep the default. */
export const AGENT_TIERS = ["verified", "recognised", "unknown-automation"] as const;
export type AgentTier = (typeof AGENT_TIERS)[number];

export function isAgentTier(tier: Tier): tier is AgentTier {
  return (AGENT_TIERS as readonly Tier[]).includes(tier);
}

const LOCKED = new Map<Scope, boolean>();

/**
 * A limit the site sets for the whole product: the default refuses this scope for every kind of agent (today,
 * delete). No agent rule can loosen it.
 */
export function lockedScope(scope: Scope): boolean {
  let locked = LOCKED.get(scope);
  if (locked === undefined) {
    const probe: ActionDef = { id: scope, label: scope, method: "POST", path: "/", route: "/", scope, risk: "critical" };
    LOCKED.set(scope, (locked = AGENT_TIERS.every((t) => baseDecision(t, probe).outcome === "refuse")));
  }
  return locked;
}

/**
 * The default policy pack from the blueprint, evaluated in observe mode: the console records what would have
 * happened to each agent action without enforcing anything.
 *
 * `rule` is the site's own rule for this agent and scope, when it set one (resolved by src/lib/agent-rules.ts): allow
 * admits, ask asks the person, never refuses. It replaces the default for agents only, never for people or undecided
 * sessions, and never loosens a limit the site sets for every agent (`lockedScope`).
 *
 * `price` is what the site charges agents for this action (src/lib/pricing.ts). For a recognised or verified agent it
 * turns a go-ahead, or a request for access, into `bill`: paying is the access. It never overrides an action the
 * person must approve (`ask`) or one that is refused, and people, undecided sessions and unknown automation are never
 * billed.
 */
export function decide(tier: Tier, action: ActionDef, price?: number | null, rule?: RuleChoice | null): PolicyDecision {
  const d = rule && isAgentTier(tier) && !lockedScope(action.scope) ? ruleDecision(rule, action) : baseDecision(tier, action);
  if (price && price > 0 && (tier === "verified" || tier === "recognised") && (d.outcome === "admit" || d.outcome === "request_access")) {
    return { outcome: "bill", policy: `pricing/${action.id}`, price };
  }
  return d;
}

const RULE_OUTCOME: Record<Choice, Outcome> = { allow: "admit", ask: "ask", never: "refuse" };

/** A site's rule, named after whom it was set for: `site/claude-in-chrome/export`. */
function ruleDecision(rule: RuleChoice, action: ActionDef): PolicyDecision {
  return { outcome: RULE_OUTCOME[rule.choice], policy: `site/${rule.subject}/${action.scope}` };
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
