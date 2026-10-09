import "server-only";

import { ACTIONS, SCOPES, UNNAMED_ID, getAccount, getDriver, getUser } from "./catalog";
import { UNASSIGNED_ACCOUNT, accountText, personText, type Tone } from "./format";
import { DAY, HOUR, MINUTE } from "./generate";
import { decide } from "./policy";
import { priceFor } from "./pricing";
import { RANGES, accountStats, accounts, driverStats, scopeStats, series, toRow, totals, type Range } from "./queries";
import { HISTORY, store } from "./store";
import type { ActionDef, Outcome, Scope, Session, Tier } from "./types";

/**
 * Read models for the restyled pages: the Overview dashboard, the live activity feed, the rules and the
 * sidebar's live count. Pure over the store and the existing queries; nothing here writes.
 */

// ───────────────────────── Policy by scope ─────────────────────────

/** The policy decides on the agent's tier and the action's scope, so one action stands in for each scope. */
const SAMPLE = new Map<Scope, ActionDef>();
for (const a of ACTIONS) if (!SAMPLE.has(a.scope)) SAMPLE.set(a.scope, a);

export function decideScope(tier: Tier, scope: Scope) {
  return decide(tier, SAMPLE.get(scope)!);
}

function emptyOutcomes(): Record<Outcome, number> {
  return { admit: 0, slow: 0, request_access: 0, ask: 0, reroute: 0, bill: 0, refuse: 0 };
}

/** What the rules would do with every agent action in these sessions (observe mode: nothing is enforced). */
function outcomeCounts(sessions: Session[]): Record<Outcome, number> {
  const out = emptyOutcomes();
  for (const s of sessions) {
    if (s.verdict !== "agent") continue;
    for (const [scope, n] of Object.entries(s.scopes) as [Scope, number][]) out[decideScope(s.tier, scope).outcome] += n;
  }
  return out;
}

// ───────────────────────── Live ─────────────────────────

/** Sessions still going right now, for the sidebar and the first tile. */
export function liveNow(siteId: string, now = Date.now()): { sessions: number; agents: number } {
  const live = store.sessions(now - DAY, now, now, siteId).filter((s) => s.endedAt > now);
  return { sessions: live.length, agents: live.filter((s) => s.verdict === "agent").length };
}

// ───────────────────────── Activity feed ─────────────────────────

export interface FeedRow {
  id: string;
  ts: number;
  sessionId: string;
  driver: string;
  driverId: string;
  person: string;
  account: string;
  action: string;
  outcome: Outcome;
}

/** Page views by agents, newest first: what the feed shows on a site that marks no actions (a marketing site). */
export function latestAgentPages(sessions: Session[], now: number, limit = 8): FeedRow[] {
  const candidates = sessions.filter((s) => s.verdict === "agent").sort((a, b) => b.lastAt - a.lastAt);
  const rows: FeedRow[] = [];
  for (const s of candidates) {
    if (rows.length >= limit && s.lastAt < rows[rows.length - 1]!.ts) break;
    const user = getUser(s.userId);
    const driverName = getDriver(s.driverId)?.name ?? "Unknown automation";
    store.events(s, now).forEach((e, j) => {
      if (e.driver !== "agent" || e.type !== "page") return;
      rows.push({
        id: `p_${s.id.slice(4)}${j.toString(36)}`,
        ts: s.startedAt + e.t,
        sessionId: s.id,
        driver: driverName,
        driverId: s.driverId ?? UNNAMED_ID,
        person: personText(user?.email ?? s.userId),
        account: accountText(s.accountId, getAccount(s.accountId)?.name ?? s.accountId),
        action: `Opened ${e.route}`,
        // Reading a page is the "view" scope.
        outcome: decideScope(s.tier, "view").outcome,
      });
    });
    rows.sort((a, b) => b.ts - a.ts);
    if (rows.length > limit) rows.length = limit;
  }
  return rows;
}

/** Pages agents read most, for sites where agents mostly read. */
export function agentRoutes(sessions: Session[], now: number, limit = 6): { route: string; views: number; agents: number }[] {
  const map = new Map<string, { views: number; drivers: Set<string> }>();
  for (const s of sessions.filter((x) => x.verdict === "agent").slice(-400)) {
    for (const e of store.events(s, now)) {
      if (e.driver !== "agent" || e.type !== "page") continue;
      const m = map.get(e.route) ?? { views: 0, drivers: new Set() };
      m.views++;
      m.drivers.add(s.driverId ?? "");
      map.set(e.route, m);
    }
  }
  return [...map.entries()]
    .map(([route, m]) => ({ route, views: m.views, agents: m.drivers.size }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

/** The latest agent actions, newest first. Only opens the sessions that can still beat what it has. */
export function latestActions(sessions: Session[], now: number, limit = 8): FeedRow[] {
  const candidates = sessions.filter((s) => s.verdict === "agent" && Object.keys(s.scopes).length > 0).sort((a, b) => b.lastAt - a.lastAt);
  const rows: FeedRow[] = [];
  for (const s of candidates) {
    if (rows.length >= limit && s.lastAt < rows[rows.length - 1]!.ts) break;
    const user = getUser(s.userId);
    const driverName = getDriver(s.driverId)?.name ?? "Unknown automation";
    store.events(s, now).forEach((e, j) => {
      if (e.driver !== "agent" || !e.action) return;
      rows.push({
        // Same id as the activity log's line for this action.
        id: `e_${s.id.slice(4)}${j.toString(36)}`,
        ts: s.startedAt + e.t,
        sessionId: s.id,
        driver: driverName,
        driverId: s.driverId ?? UNNAMED_ID,
        person: personText(user?.email ?? s.userId),
        account: accountText(s.accountId, getAccount(s.accountId)?.name ?? s.accountId),
        action: e.action.label,
        outcome: decide(s.tier, e.action, priceFor(store.siteOf(s), e.action.id)).outcome,
      });
    });
    rows.sort((a, b) => b.ts - a.ts);
    if (rows.length > limit) rows.length = limit;
  }
  return rows;
}

// ───────────────────────── Overview ─────────────────────────

/** Columns on the People and agents chart: about thirty per range. */
const CHART_BUCKET: Record<Range, number> = { "1h": 2 * MINUTE, "24h": HOUR, "7d": 6 * HOUR };
const BUCKET_WORDS: Record<Range, string> = { "1h": "every 2 minutes", "24h": "per hour", "7d": "every 6 hours" };

/** `routes`: also count the pages agents open (for sites where agents mostly read, or mark no actions). */
export function dashboard(siteId: string, range: Range, now = Date.now(), opts: { routes?: boolean } = {}) {
  const r = RANGES.find((x) => x.id === range)!;
  const from = now - r.ms;
  const sessions = store.sessions(from, now, now, siteId);
  const t = totals(sessions);
  const prev = from - r.ms >= now - HISTORY ? totals(store.sessions(from - r.ms, from, now, siteId)) : null;

  const agentSessions = sessions.filter((s) => s.verdict === "agent");
  const accountsWithAgents = new Set(agentSessions.map((s) => s.accountId).filter((id) => id !== UNASSIGNED_ACCOUNT));
  const peopleWithAgents = new Set(agentSessions.map((s) => s.userId));
  const drivers = driverStats(sessions);
  const outcomes = outcomeCounts(sessions);
  // Live activity and the live count look back a day even on the last-hour view, so a long-running session still counts.
  const feedFrom = range === "1h" ? store.sessions(now - DAY, now, now, siteId) : sessions;
  const live = feedFrom.filter((s) => s.endedAt > now);
  const bucket = CHART_BUCKET[range];
  // A site that marks no actions (visitors only read it) still shows agents at work: the pages they open.
  const actions = latestActions(feedFrom, now, 8);
  const feed = actions.length ? { kind: "actions" as const, rows: actions } : { kind: "pages" as const, rows: latestAgentPages(feedFrom, now, 8) };
  const agentActions = Object.values(outcomes).reduce((n, v) => n + v, 0);
  const accountRows = accountStats(sessions)
    .filter((a) => a.id !== UNASSIGNED_ACCOUNT)
    .slice(0, 5);

  return {
    range: r,
    totals: t,
    share: t.sessions ? t.agent / t.sessions : 0,
    previousShare: prev && prev.sessions ? prev.agent / prev.sessions : null,
    live: { sessions: live.length, agents: live.filter((s) => s.verdict === "agent").length },
    agentsSeen: drivers.length,
    accountsWithAgents: accountsWithAgents.size,
    peopleWithAgents: peopleWithAgents.size,
    outcomes,
    agentActions,
    chart: { points: series(sessions, from, now, bucket), bucket, words: BUCKET_WORDS[range] },
    topAgents: drivers.map((d) => ({
      id: d.driver?.id ?? UNNAMED_ID,
      name: d.driver?.name ?? "Unknown automation",
      sessions: d.sessions,
      share: d.share,
    })),
    feed,
    scopes: scopeStats(sessions),
    routes: opts.routes || !agentActions || !accountRows.length ? agentRoutes(sessions, now) : [],
    accounts: accountRows,
    latest: sessions
      .slice(-6)
      .reverse()
      .map((s) => toRow(s, now)),
  };
}

// ───────────────────────── Accounts ─────────────────────────

/** Accounts, leaving out sessions from visitors who never signed in (counted separately). */
export function accountsView(siteId: string, range: Range, now = Date.now()) {
  const data = accounts(siteId, range, now);
  const unassigned = data.rows.find((a) => a.id === UNASSIGNED_ACCOUNT) ?? null;
  const rows = data.rows.filter((a) => a.id !== UNASSIGNED_ACCOUNT);
  return {
    rows,
    humanHours: rows.reduce((n, a) => n + a.humanHours, 0),
    agentHours: rows.reduce((n, a) => n + a.agentHours, 0),
    overSeat: rows.filter((a) => a.agentHours > a.humanHours).length,
    unassigned: unassigned ? { sessions: unassigned.sessions, agentSessions: unassigned.agentSessions } : null,
  };
}

// ───────────────────────── Rules ─────────────────────────

export type Choice = "allow" | "ask" | "never";

const CHOICE: Record<Outcome, Choice> = {
  admit: "allow",
  slow: "allow",
  bill: "allow",
  reroute: "ask",
  request_access: "ask",
  ask: "ask",
  refuse: "never",
};

const NOTE: Partial<Record<Outcome, string>> = {
  slow: "Allowed, but slowed down",
  bill: "Allowed, and billed",
  request_access: "The person grants access first",
  ask: "The person confirms each one",
};

const AGENT_TIERS: Tier[] = ["verified", "recognised", "unknown-automation"];

export interface RuleRow {
  scope: Scope;
  label: string;
  examples: string[];
  outcome: Outcome;
  policy: string;
  choice: Choice;
  note: string | null;
  /** The same "never" for every agent: a limit the site sets, which nobody below it can loosen. */
  locked: boolean;
}

export function ruleRows(tier: Tier): RuleRow[] {
  return SCOPES.map((sc) => {
    const d = decideScope(tier, sc.id);
    return {
      scope: sc.id,
      label: sc.label,
      examples: ACTIONS.filter((a) => a.scope === sc.id)
        .slice(0, 3)
        .map((a) => a.label),
      outcome: d.outcome,
      policy: d.policy,
      choice: CHOICE[d.outcome],
      note: NOTE[d.outcome] ?? null,
      locked: tier !== "human" && AGENT_TIERS.every((t) => decideScope(t, sc.id).outcome === "refuse"),
    };
  });
}

/** One word for how much a tier may do, for the list of agents. */
export function ruleSummary(tier: Tier): { label: string; tone: Tone } {
  if (tier === "human") return { label: "Roles", tone: "mute" };
  const rows = ruleRows(tier);
  const allowed = rows.filter((r) => r.outcome === "admit");
  if (allowed.length >= 3) return { label: "On", tone: "ok" };
  if (allowed.some((r) => r.scope === "view")) return { label: "View", tone: "ask" };
  if (rows.some((r) => r.outcome === "slow")) return { label: "Slowed", tone: "ask" };
  return { label: "Off", tone: "no" };
}

export interface RuleEntry {
  id: string;
  name: string;
  provider: string | null;
  tier: Tier;
  sessions: number;
}

/** Who the rules apply to: agents seen this week by name, any tier not seen yet, unknown automation, and people. */
export function ruleEntries(siteId: string, now = Date.now()): RuleEntry[] {
  const stats = driverStats(store.sessions(now - 7 * DAY, now, now, siteId));
  const entries: RuleEntry[] = stats
    .filter((d) => d.driver)
    .slice(0, 8)
    .map((d) => ({ id: d.driver!.id, name: d.driver!.name, provider: d.driver!.provider, tier: d.driver!.tier, sessions: d.sessions }));
  if (!entries.some((e) => e.tier === "verified")) entries.push({ id: "any-verified", name: "Verified agents", provider: null, tier: "verified", sessions: 0 });
  if (!entries.some((e) => e.tier === "recognised")) entries.push({ id: "any-recognised", name: "Recognised agents", provider: null, tier: "recognised", sessions: 0 });
  entries.push({
    id: UNNAMED_ID,
    name: "Unknown automation",
    provider: null,
    tier: "unknown-automation",
    sessions: stats.find((d) => !d.driver)?.sessions ?? 0,
  });
  entries.push({ id: "people", name: "People", provider: null, tier: "human", sessions: 0 });
  return entries;
}

/** Scopes this tier is allowed outright, for a session's "Allowed to" line. */
export function allowedScopes(tier: Tier): string[] {
  return ruleRows(tier)
    .filter((r) => r.outcome === "admit")
    .map((r) => r.label);
}
