import "server-only";

import { ruleFor } from "./agent-rules";
import { ACCOUNTS, SCOPES, UNNAMED_ID, allDrivers, getAccount, getDriver, getUser } from "./catalog";
import { DAY, HOUR, MINUTE, reasonsFor } from "./generate";
import { exactMatch } from "./passport";
import { decide } from "./policy";
import { priceFor } from "./pricing";
import { HISTORY, store } from "./store";
import { OUTCOME_RANK } from "./format";
import { personKey, visitContaining, visitList } from "./visits";
import type { ActionDef, Driver, EntryLogLine, Outcome, Reason, Scope, Session, SessionEvent, Verdict } from "./types";

export type Range = "1h" | "24h" | "7d";

export const RANGES: { id: Range; label: string; ms: number; bucket: number }[] = [
  { id: "1h", label: "Last hour", ms: HOUR, bucket: 2 * MINUTE },
  { id: "24h", label: "Last 24 hours", ms: DAY, bucket: 30 * MINUTE },
  { id: "7d", label: "Last 7 days", ms: 7 * DAY, bucket: 4 * HOUR },
];

export function parseRange(value: string | string[] | undefined): Range {
  return RANGES.some((r) => r.id === value) ? (value as Range) : "24h";
}

function bounds(range: Range, now: number) {
  const r = RANGES.find((x) => x.id === range)!;
  return { from: now - r.ms, to: now, bucket: r.bucket, ms: r.ms };
}

const SENSITIVE: Scope[] = ["export", "edit", "invite", "send", "pay", "settings", "delete"];

function sensitiveCount(s: Session): number {
  let n = 0;
  for (const scope of SENSITIVE) n += s.scopes[scope] ?? 0;
  return n;
}

export interface Totals {
  sessions: number;
  human: number;
  agent: number;
  unknown: number;
  takeovers: number;
  agentActions: number;
  sensitive: number;
}

export function totals(sessions: Session[]): Totals {
  const t: Totals = { sessions: sessions.length, human: 0, agent: 0, unknown: 0, takeovers: 0, agentActions: 0, sensitive: 0 };
  for (const s of sessions) {
    t[s.verdict]++;
    if (s.handoffAt !== null) t.takeovers++;
    t.agentActions += s.agentActions;
    t.sensitive += sensitiveCount(s);
  }
  return t;
}

export interface SeriesPoint {
  t: number;
  human: number;
  agent: number;
  unknown: number;
}

/** Sessions started per bucket. Buckets end at `to`, so the last one is complete rather than a partial dip. */
export function series(sessions: Session[], from: number, to: number, bucket: number): SeriesPoint[] {
  const n = Math.max(1, Math.round((to - from) / bucket));
  const start = to - n * bucket;
  const points: SeriesPoint[] = Array.from({ length: n }, (_, i) => ({ t: start + i * bucket, human: 0, agent: 0, unknown: 0 }));
  for (const s of sessions) {
    const p = points[Math.floor((s.startedAt - start) / bucket)];
    if (p) p[s.verdict]++;
  }
  return points;
}

// ───────────────────────── Rows ─────────────────────────

export interface SessionRow {
  id: string;
  email: string;
  name: string;
  account: string;
  accountId: string;
  verdict: Verdict;
  tier: Session["tier"];
  driver: string | null;
  driverId: string | null;
  confidence: number;
  startedAt: number;
  lastAt: number;
  live: boolean;
  takeover: boolean;
  /** When an agent took over from the person, if it did. */
  handoffAt: number | null;
  /** The strongest decision the rules would make on this session's agent actions, if it had any. */
  outcome: Outcome | null;
  last: { route: string; action: string | null; method: string | null; path: string | null; driver: Verdict } | null;
  actions: number;
  sensitive: number;
  source: Session["source"];
}

export function toRow(s: Session, now: number): SessionRow {
  const user = getUser(s.userId);
  const events = store.events(s, now);
  const last = events[events.length - 1];
  const lastAction = [...events].reverse().find((e) => e.type === "action");
  let outcome: Outcome | null = null;
  const site = store.siteOf(s);
  if (s.verdict === "agent") {
    for (const e of events) {
      if (e.driver !== "agent" || !e.action) continue;
      const o = decide(s.tier, e.action, priceFor(site, e.action.id), ruleFor(site, s, e.action.scope)).outcome;
      if (outcome === null || OUTCOME_RANK.indexOf(o) < OUTCOME_RANK.indexOf(outcome)) outcome = o;
    }
  }
  return {
    id: s.id,
    email: user?.email ?? s.userId,
    name: user?.name ?? s.userId,
    account: getAccount(s.accountId)?.name ?? s.accountId,
    accountId: s.accountId,
    verdict: s.verdict,
    tier: s.tier,
    driver: s.driverId ? (getDriver(s.driverId)?.name ?? s.driverId) : null,
    driverId: s.driverId,
    confidence: s.confidence,
    startedAt: s.startedAt,
    lastAt: s.lastAt,
    live: s.endedAt > now,
    takeover: s.handoffAt !== null,
    handoffAt: s.handoffAt === null ? null : s.startedAt + s.handoffAt,
    outcome,
    last: last
      ? {
          route: last.route,
          action: lastAction?.action?.label ?? null,
          method: lastAction?.action?.method ?? null,
          path: lastAction?.action?.path ?? null,
          driver: last.driver,
        }
      : null,
    actions: s.humanActions + s.agentActions,
    sensitive: sensitiveCount(s),
    source: s.source,
  };
}

export interface SessionFilter {
  /** The site whose sessions to list. */
  siteId: string;
  verdict?: Verdict | "all";
  driverId?: string;
  accountId?: string;
  q?: string;
  live?: boolean;
  limit?: number;
  range?: Range;
}

/** The filters other than who is driving, each as a test on one session. */
function sessionTests(filter: SessionFilter, now: number): ((s: Session) => boolean)[] {
  const tests: ((s: Session) => boolean)[] = [];
  const { driverId, accountId } = filter;
  if (driverId) tests.push((s) => (s.driverId ?? (s.verdict === "agent" ? UNNAMED_ID : null)) === driverId);
  if (accountId) tests.push((s) => s.accountId === accountId);
  if (filter.live) tests.push((s) => s.endedAt > now);
  const q = filter.q?.trim().toLowerCase();
  if (q) {
    tests.push((s) => {
      const user = getUser(s.userId);
      const account = getAccount(s.accountId);
      return `${user?.email ?? ""} ${account?.name ?? ""} ${s.id}`.toLowerCase().includes(q);
    });
  }
  return tests;
}

export function listSessions(filter: SessionFilter, now = Date.now()): { rows: SessionRow[]; total: number; counts: Totals } {
  const { siteId } = filter;
  const { from, to } = bounds(filter.range ?? "24h", now);
  const all = store.sessions(from, to, now, siteId);
  const tests = sessionTests(filter, now);
  const matching = all.filter((s) => tests.every((test) => test(s)));
  const counts = totals(matching);
  const shown = filter.verdict && filter.verdict !== "all" ? matching.filter((s) => s.verdict === filter.verdict) : matching;
  const rows = shown
    .slice(-Math.max(1, Math.floor(filter.limit ?? 100)))
    .reverse()
    .map((s) => toRow(s, now));
  return { rows, total: shown.length, counts };
}

/** The Sessions page: one row per visit, a person's tabs together (see visits.ts). A visit passes a filter when any of its tabs does. */
export function listVisits(filter: SessionFilter, now = Date.now()) {
  const { from, to } = bounds(filter.range ?? "24h", now);
  const sessions = store.sessions(from, to, now, filter.siteId);
  return visitList(sessions, { verdict: filter.verdict, tests: sessionTests(filter, now), limit: filter.limit, toRow: (s) => toRow(s, now) });
}

/** Every tab of the visit this session belongs to, oldest first, with its page count. Empty when the session stands alone. */
export function sessionVisit(siteId: string, session: Session, now = Date.now()): (SessionRow & { pages: number })[] {
  if (personKey(session.userId) === null) return [];
  // A visit's earlier tabs can open before this one, so look back a day (the list's default range).
  const nearby = store.sessions(session.startedAt - DAY, now, now, siteId).filter((s) => s.userId === session.userId);
  const tabs = visitContaining(nearby, session.id) ?? [];
  if (tabs.length < 2) return [];
  return tabs.map((s) => ({ ...toRow(s, now), pages: store.events(s, now).filter((e) => e.type === "page").length }));
}

// ───────────────────────── Overview ─────────────────────────

export interface DriverStat {
  driver: (Driver & { share: number }) | null;
  sessions: number;
  users: number;
  accounts: number;
  agentActions: number;
  sensitive: number;
  takeovers: number;
  share: number;
}

export function driverStats(sessions: Session[]): DriverStat[] {
  const map = new Map<string, { sessions: number; users: Set<string>; accounts: Set<string>; agentActions: number; sensitive: number; takeovers: number }>();
  let agents = 0;
  for (const s of sessions) {
    if (s.verdict !== "agent") continue;
    agents++;
    const key = s.driverId ?? "";
    const m = map.get(key) ?? { sessions: 0, users: new Set(), accounts: new Set(), agentActions: 0, sensitive: 0, takeovers: 0 };
    m.sessions++;
    m.users.add(s.userId);
    m.accounts.add(s.accountId);
    m.agentActions += s.agentActions;
    m.sensitive += sensitiveCount(s);
    if (s.handoffAt !== null) m.takeovers++;
    map.set(key, m);
  }
  return [...map.entries()]
    .map(([id, m]) => ({
      driver: getDriver(id) ?? null,
      sessions: m.sessions,
      users: m.users.size,
      accounts: m.accounts.size,
      agentActions: m.agentActions,
      sensitive: m.sensitive,
      takeovers: m.takeovers,
      share: agents ? m.sessions / agents : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

export interface ScopeStat {
  scope: Scope;
  label: string;
  risk: (typeof SCOPES)[number]["risk"];
  count: number;
}

export function scopeStats(sessions: Session[]): ScopeStat[] {
  return SCOPES.map((sc) => ({
    scope: sc.id,
    label: sc.label,
    risk: sc.risk,
    count: sessions.reduce((n, s) => n + (s.scopes[sc.id] ?? 0), 0),
  }));
}

export function overview(siteId: string, range: Range, now = Date.now()) {
  const { from, to, bucket, ms } = bounds(range, now);
  const sessions = store.sessions(from, to, now, siteId);
  const current = totals(sessions);
  const previous = from - ms >= now - HISTORY ? totals(store.sessions(from - ms, from, now, siteId)) : null;
  return {
    totals: current,
    previous,
    series: series(sessions, from, to, bucket),
    bucket,
    drivers: driverStats(sessions),
    scopes: scopeStats(sessions),
    accounts: accountStats(sessions).slice(0, 5),
    live: sessions.filter((s) => s.endedAt > now).length,
    liveAgents: sessions.filter((s) => s.endedAt > now && s.verdict === "agent").length,
  };
}

// ───────────────────────── Agents ─────────────────────────

export function agents(siteId: string, range: Range, now = Date.now()) {
  const { from, to } = bounds(range, now);
  const sessions = store.sessions(from, to, now, siteId);
  const stats = driverStats(sessions);
  const week = store.sessions(now - 7 * DAY, now, now, siteId);
  const trend = new Map<string, number[]>();
  for (const s of week) {
    if (s.verdict !== "agent") continue;
    const key = s.driverId ?? "";
    const days = trend.get(key) ?? Array<number>(7).fill(0);
    const d = Math.min(6, Math.floor((s.startedAt - (now - 7 * DAY)) / DAY));
    days[d] = (days[d] ?? 0) + 1;
    trend.set(key, days);
  }
  return {
    totals: totals(sessions),
    rows: stats.map((s) => ({ ...s, trend: trend.get(s.driver?.id ?? "") ?? Array<number>(7).fill(0) })),
    known: allDrivers().length,
  };
}

/** Filter options: agents seen in the last week, most sessions first. */
export function seenDrivers(siteId: string, now = Date.now()): { value: string; label: string }[] {
  return driverStats(store.sessions(now - 7 * DAY, now, now, siteId)).map((d) => ({
    value: d.driver?.id ?? UNNAMED_ID,
    label: d.driver?.name ?? "Unknown automation",
  }));
}

export function agentDetail(siteId: string, driverId: string, range: Range, now = Date.now()) {
  const driver = driverId === UNNAMED_ID ? null : getDriver(driverId);
  if (driverId !== UNNAMED_ID && !driver) return null;
  const key = driver ? driver.id : null;
  const { from, to, bucket: fine } = bounds(range, now);
  // One driver is a thin slice of traffic, so use wider buckets than the overview to keep the line readable.
  const bucket = fine * 2;
  const all = store.sessions(from, to, now, siteId);
  const sessions = all.filter((s) => s.verdict === "agent" && s.driverId === key);
  const agentTotal = all.filter((s) => s.verdict === "agent").length;

  const actions = new Map<string, { action: ActionDef; count: number }>();
  const routes = new Map<string, number>();
  for (const s of sessions.slice(-400)) {
    for (const e of store.events(s, now)) {
      if (e.driver !== "agent") continue;
      if (e.type === "page") routes.set(e.route, (routes.get(e.route) ?? 0) + 1);
      if (e.action) {
        const a = actions.get(e.action.id) ?? { action: e.action, count: 0 };
        a.count++;
        actions.set(e.action.id, a);
      }
    }
  }

  const points = series(sessions, from, to, bucket);
  return {
    driver,
    stat: driverStats(sessions)[0] ?? null,
    share: agentTotal ? sessions.length / agentTotal : 0,
    series: points,
    bucket,
    scopes: scopeStats(sessions),
    actions: [...actions.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    accounts: accountStats(sessions).slice(0, 6),
    recent: sessions.slice(-8).reverse().map((s) => toRow(s, now)),
  };
}

// ───────────────────────── Accounts ─────────────────────────

export interface AccountStat {
  id: string;
  name: string;
  domain: string;
  plan: string;
  seats: number;
  users: number;
  agentUsers: number;
  sessions: number;
  agentSessions: number;
  humanHours: number;
  agentHours: number;
  sensitive: number;
  topDriver: string | null;
}

export function accountStats(sessions: Session[]): AccountStat[] {
  const map = new Map<string, { users: Set<string>; agentUsers: Set<string>; sessions: number; agentSessions: number; human: number; agent: number; sensitive: number; drivers: Map<string, number> }>();
  for (const s of sessions) {
    const m = map.get(s.accountId) ?? { users: new Set(), agentUsers: new Set(), sessions: 0, agentSessions: 0, human: 0, agent: 0, sensitive: 0, drivers: new Map() };
    const duration = s.lastAt - s.startedAt;
    m.sessions++;
    m.users.add(s.userId);
    if (s.verdict === "agent") {
      m.agentSessions++;
      m.agentUsers.add(s.userId);
      const humanPart = s.handoffAt ?? 0;
      m.human += humanPart;
      m.agent += Math.max(0, duration - humanPart);
      m.sensitive += sensitiveCount(s);
      const key = s.driverId ?? "";
      m.drivers.set(key, (m.drivers.get(key) ?? 0) + 1);
    } else if (s.verdict === "human") m.human += duration;
    map.set(s.accountId, m);
  }
  return ACCOUNTS.filter((a) => map.has(a.id))
    .map((a) => {
      const m = map.get(a.id)!;
      const top = [...m.drivers.entries()].sort((x, y) => y[1] - x[1])[0];
      return {
        id: a.id,
        name: a.name,
        domain: a.domain,
        plan: a.plan,
        seats: a.seats,
        users: m.users.size,
        agentUsers: m.agentUsers.size,
        sessions: m.sessions,
        agentSessions: m.agentSessions,
        humanHours: m.human / HOUR,
        agentHours: m.agent / HOUR,
        sensitive: m.sensitive,
        topDriver: top ? (getDriver(top[0])?.name ?? "Unknown automation") : null,
      };
    })
    .sort((x, y) => y.agentHours - x.agentHours);
}

export function accounts(siteId: string, range: Range, now = Date.now()) {
  const { from, to } = bounds(range, now);
  const sessions = store.sessions(from, to, now, siteId);
  const rows = accountStats(sessions);
  const humanHours = rows.reduce((n, r) => n + r.humanHours, 0);
  const agentHours = rows.reduce((n, r) => n + r.agentHours, 0);
  return { rows, humanHours, agentHours, overSeat: rows.filter((r) => r.agentHours > r.humanHours).length };
}

// ───────────────────────── Session detail ─────────────────────────

export interface RouteActivity {
  route: string;
  driver: Verdict;
  at: number;
  actions: number;
  sensitive: number;
}

export function sessionDetail(siteId: string, id: string, now = Date.now()) {
  const session = store.session(id, now, siteId);
  if (!session) return null;
  const events = store.events(session, now);
  const reasons: Reason[] = session.source === "sensor" ? (store.sensor.get(session.id)?.reasons ?? []) : reasonsFor(session);

  // Group consecutive events on the same page by the same driver, like a visit.
  const activity: RouteActivity[] = [];
  for (const e of events) {
    const prev = activity[activity.length - 1];
    const sensitive = e.action && e.action.scope !== "view" ? 1 : 0;
    if (prev && prev.route === e.route && prev.driver === e.driver) {
      if (e.type === "action") prev.actions++;
      prev.sensitive += sensitive;
    } else {
      activity.push({ route: e.route, driver: e.driver, at: session.startedAt + e.t, actions: e.type === "action" ? 1 : 0, sensitive });
    }
  }

  const site = store.siteOf(session);
  const decisions = events
    .filter((e): e is SessionEvent & { action: ActionDef } => e.driver === "agent" && e.type === "action" && !!e.action)
    .map((e) => ({ at: session.startedAt + e.t, action: e.action, ...decide(session.tier, e.action, priceFor(site, e.action.id), ruleFor(site, session, e.action.scope)) }));

  return {
    session,
    row: toRow(session, now),
    user: getUser(session.userId),
    account: getAccount(session.accountId),
    driver: getDriver(session.driverId) ?? null,
    events,
    reasons,
    activity,
    decisions,
    decision: sensorDecision(session.id),
    live: session.endedAt > now,
    now,
  };
}

/** For sensor sessions: what decided the verdict, Jev's latest answer and what the in-browser rules said. */
function sensorDecision(id: string) {
  const rec = store.sensor.get(id);
  if (!rec) return null;
  return {
    decidedBy: rec.session.decidedBy ?? null,
    label: rec.label,
    exact: exactMatch(rec),
    jev: rec.jev ? { ...rec.jev, candidates: rec.jev.candidates.map((c) => ({ ...c, name: c.id === "human" ? "A person" : c.id === "unknown_automation" ? "Unknown automation" : (getDriver(c.id)?.name ?? c.id) })) } : null,
    jevError: rec.jevStatus.error,
    rules: rec.rules ? { ...rec.rules, driverName: getDriver(rec.rules.driverId)?.name ?? null } : null,
  };
}

// ───────────────────────── Entry log ─────────────────────────

/** Most entries one export returns. A week of demo traffic is well under this. */
export const EXPORT_CAP = 500_000;

export function entryLog(opts: { siteId: string; range: Range; sensitiveOnly?: boolean; driverId?: string; outcome?: string; limit?: number }, now = Date.now()) {
  const { siteId } = opts;
  const { from, to } = bounds(opts.range, now);
  const sessions = store.sessions(from, to, now, siteId).filter((s) => s.verdict === "agent" && (!opts.driverId || (s.driverId ?? UNNAMED_ID) === opts.driverId));
  const lines: EntryLogLine[] = [];
  const counts = { total: 0, admit: 0, slow: 0, request_access: 0, ask: 0, reroute: 0, bill: 0, refuse: 0 };
  /** What the billed actions add up to, in millionths of a dollar. */
  let billed = 0;
  for (const s of sessions) {
    store.events(s, now).forEach((e, j) => {
      if (e.driver !== "agent" || !e.action) return;
      if (opts.sensitiveOnly && e.action.scope === "view") return;
      const d = decide(s.tier, e.action, priceFor(siteId, e.action.id), ruleFor(siteId, s, e.action.scope));
      counts.total++;
      counts[d.outcome]++;
      billed += d.price ?? 0;
      if (opts.outcome && d.outcome !== opts.outcome) return;
      lines.push({
        id: `e_${s.id.slice(4)}${j.toString(36)}`,
        ts: s.startedAt + e.t,
        sessionId: s.id,
        userId: s.userId,
        accountId: s.accountId,
        driverId: s.driverId ?? UNNAMED_ID,
        tier: s.tier,
        action: e.action,
        outcome: d.outcome,
        policy: d.policy,
        price: d.price,
      });
    });
  }
  lines.sort((a, b) => b.ts - a.ts);
  lines.length = Math.min(lines.length, Math.max(0, Math.floor(opts.limit ?? 200)));
  return {
    counts,
    billed,
    lines: lines.map((l) => ({
      ...l,
      email: getUser(l.userId)?.email ?? l.userId,
      account: getAccount(l.accountId)?.name ?? l.accountId,
      driver: getDriver(l.driverId)?.name ?? "Unknown automation",
    })),
  };
}
