/**
 * Agent rules: what a site lets each agent, or each kind of agent, do with each scope, set on the Rules page. A rule
 * replaces the default policy (src/lib/policy.ts) for its subject and scope.
 *
 * A subject is a driver id from the agent registry (`claude-in-chrome`) or a group: `any-verified`, `any-recognised`
 * and `unnamed` (unknown automation). For a session, the rule for its driver wins, then the group rule for its tier,
 * then the default. People and undecided sessions are never affected, and no rule loosens a limit the site sets for
 * every agent (`lockedScope`).
 *
 * Rules live in the database (`observe.agent_rules`, loaded with the sites by `syncStore`). The demo site has none.
 */
import { SCOPES, UNNAMED_ID, getDriver } from "./catalog";
import type { StoredAgentRule } from "./db";
import { isAgentTier, lockedScope, type AgentTier } from "./policy";
import type { Scope, Tier } from "./types";

export type Choice = "allow" | "ask" | "never";

/** The rule that applies to an agent and scope, and whom it was set for: a driver id or a group. */
export interface RuleChoice {
  choice: Choice;
  subject: string;
}

/** The group each kind of agent falls back on when its own driver has no rule. */
export const GROUP: Record<AgentTier, string> = { verified: "any-verified", recognised: "any-recognised", "unknown-automation": UNNAMED_ID };

/** Subjects as the database accepts them (`observe.agent_rules.subject`). */
const SUBJECT = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;

export function isChoice(value: unknown): value is Choice {
  return value === "allow" || value === "ask" || value === "never";
}

export function isScope(value: unknown): value is Scope {
  return SCOPES.some((s) => s.id === value);
}

/** The kind of agent a subject stands for: a group's tier, or the tier the registry gives a driver. Null for anything else, people included. */
export function subjectTier(subject: string): AgentTier | null {
  for (const [tier, group] of Object.entries(GROUP) as [AgentTier, string][]) if (group === subject) return tier;
  if (!SUBJECT.test(subject)) return null;
  return getDriver(subject)?.tier ?? null;
}

/** site → subject → scope → choice */
type Rules = Map<string, Map<string, Map<Scope, Choice>>>;

// On globalThis so a dev-server reload keeps what the last sync loaded.
const g = globalThis as unknown as { __observeAgentRules?: Rules };
g.__observeAgentRules ??= new Map();

function put(rules: Rules, siteId: string, subject: string, scope: Scope, choice: Choice | null): void {
  let bySubject = rules.get(siteId);
  if (!bySubject) rules.set(siteId, (bySubject = new Map()));
  let byScope = bySubject.get(subject);
  if (!byScope) bySubject.set(subject, (byScope = new Map()));
  if (choice) byScope.set(scope, choice);
  else byScope.delete(scope);
}

/** Replace the database's rules (called by `syncStore`). */
export function setStoredAgentRules(rows: StoredAgentRule[]): void {
  const rules: Rules = new Map();
  for (const r of rows) {
    if (isScope(r.scope) && isChoice(r.choice)) put(rules, r.site, r.subject, r.scope, r.choice);
  }
  g.__observeAgentRules = rules;
}

/** Record a rule this server just wrote, so pages show it before the next sync. Null removes it. */
export function setLocalAgentRule(siteId: string, subject: string, scope: Scope, choice: Choice | null): void {
  put(g.__observeAgentRules!, siteId, subject, scope, choice);
}

/** Every subject a site has set at least one rule for. */
export function ruleSubjects(siteId: string): string[] {
  return [...(g.__observeAgentRules!.get(siteId) ?? [])].filter(([, byScope]) => byScope.size > 0).map(([subject]) => subject);
}

/** The rule set for exactly this subject and scope, if any (no group fallback). */
export function agentRule(siteId: string, subject: string, scope: Scope): Choice | null {
  return g.__observeAgentRules!.get(siteId)?.get(subject)?.get(scope) ?? null;
}

/**
 * The rule that decides a scope for an agent of this tier, driven by `driverId` (or, on the Rules page, a group's own
 * id): the driver's own rule, else its tier's group rule. Null means the default policy applies, as it always does for
 * people, undecided sessions and locked scopes.
 */
export function resolveRule(siteId: string, tier: Tier, driverId: string | null | undefined, scope: Scope): RuleChoice | null {
  if (!isAgentTier(tier) || lockedScope(scope)) return null;
  const bySubject = g.__observeAgentRules!.get(siteId);
  if (!bySubject) return null;
  const own = driverId ? bySubject.get(driverId)?.get(scope) : undefined;
  if (own) return { choice: own, subject: driverId! };
  const group = GROUP[tier];
  const fallback = bySubject.get(group)?.get(scope);
  return fallback ? { choice: fallback, subject: group } : null;
}

/** What applies to a subject without its own rule: its group's rule, or null for the default (a group itself falls back on the default). */
export function inheritedRule(siteId: string, tier: Tier, subject: string | null | undefined, scope: Scope): RuleChoice | null {
  if (!isAgentTier(tier) || subject === GROUP[tier]) return null;
  return resolveRule(siteId, tier, null, scope);
}

/** The rule for a session's action of this scope on this site (see `resolveRule`), to pass to `decide`. */
export function ruleFor(siteId: string, session: { tier: Tier; driverId: string | null }, scope: Scope): RuleChoice | null {
  return resolveRule(siteId, session.tier, session.driverId, scope);
}
