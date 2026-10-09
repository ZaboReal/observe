import { OUTCOME_RANK } from "./format";
import type { Outcome, Verdict } from "./types";

/**
 * Visits: one person's browser tabs on a site, shown together.
 *
 * The sensor keeps one session per tab (its id lives in sessionStorage), so a visitor with two tabs open reports two
 * sessions. Detection stays per tab, because an agent often drives one tab while the person uses another: nothing here
 * merges verdicts. It only decides which tabs share a row, and how that row reads.
 *
 * Pure functions over plain objects; queries.ts feeds them sessions from the store.
 */

/** A tab joins a visit when it opens no later than this after the visit's latest activity (the sensor's idle timeout). */
export const VISIT_GAP = 30 * 60_000;

/** What grouping needs from a session. */
export interface GroupTab {
  id: string;
  /** `device:<id>` for a visitor who never signed in, otherwise the signed-in user. */
  userId: string;
  startedAt: number;
  lastAt: number;
  /** Only needed when sessions of several sites are grouped at once: tabs on different sites never share a visit. */
  siteId?: string;
}

/**
 * Who a session belongs to, for grouping; null when that is not known well enough to group on. A sensor that could
 * not read its device id reports `device:unknown`, which many different browsers would share.
 */
export function personKey(userId: string | null | undefined): string | null {
  const id = userId?.trim();
  if (!id) return null;
  if (id.startsWith("device:")) {
    const device = id.slice("device:".length).trim();
    if (!device || device === "unknown" || device === "undefined" || device === "null") return null;
  }
  return id;
}

const byStart = <T extends { startedAt: number; id: string }>(a: T, b: T) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Group sessions into visits: the same site and person, with activity that chains together. Tabs are taken in the
 * order they opened, and a tab joins the current visit if it opened no later than `gap` after the latest `lastAt`
 * seen in that visit so far; otherwise it starts a new one. Sessions with no usable person stay alone.
 *
 * Visits come back ordered by their first tab, each visit's tabs oldest first.
 */
export function groupVisits<T extends GroupTab>(tabs: readonly T[], gap = VISIT_GAP): T[][] {
  const visits: T[][] = [];
  const byPerson = new Map<string, T[]>();
  for (const t of tabs) {
    const person = personKey(t.userId);
    if (person === null) {
      visits.push([t]);
      continue;
    }
    const key = `${t.siteId ?? ""}\u0000${person}`;
    const list = byPerson.get(key);
    if (list) list.push(t);
    else byPerson.set(key, [t]);
  }
  for (const list of byPerson.values()) {
    list.sort(byStart);
    let current: T[] = [];
    let end = -Infinity;
    for (const t of list) {
      if (current.length && t.startedAt <= end + gap) current.push(t);
      else {
        current = [t];
        visits.push(current);
        end = -Infinity;
      }
      end = Math.max(end, t.lastAt, t.startedAt);
    }
  }
  return visits.sort((a, b) => byStart(a[0]!, b[0]!));
}

/** The visit a session belongs to, among these sessions; null when it is not among them. */
export function visitContaining<T extends GroupTab>(tabs: readonly T[], id: string, gap = VISIT_GAP): T[] | null {
  return groupVisits(tabs, gap).find((v) => v.some((t) => t.id === id)) ?? null;
}

// ───────────────────────── Roll-up ─────────────────────────

/** What the roll-up needs from each tab's row. */
export interface RollupTab {
  id: string;
  verdict: Verdict;
  driver: string | null;
  driverId: string | null;
  confidence: number;
  startedAt: number;
  lastAt: number;
  live: boolean;
  /** The strongest decision the rules would make on the tab's agent actions, if it had any. */
  outcome: Outcome | null;
  /** The tab's latest page or action, as the list shows it. */
  last: unknown;
}

export interface VisitMeta {
  /** Stable while the visit grows: its first tab's session id. */
  id: string;
  tabs: number;
  /** Tabs an agent drove. */
  agentTabs: number;
  /** Different agents across those tabs (unnamed automation counts as one). */
  agents: number;
}

/** A visit as one row: the lead tab's row, with who drove, status and last action rolled up across tabs. */
export type VisitRow<R> = R & { visit: VisitMeta };

/** Most recent first: latest activity, then latest opened. */
const byRecency = <T extends { lastAt: number; startedAt: number }>(a: T, b: T) => b.lastAt - a.lastAt || b.startedAt - a.startedAt;

const mostRecent = <T extends { lastAt: number; startedAt: number }>(tabs: readonly T[]): T | undefined => [...tabs].sort(byRecency)[0];

/** Who drove the visit: an agent if any tab was an agent, else a person if any tab was one, else undecided. */
export function visitVerdict(tabs: readonly { verdict: Verdict }[]): Verdict {
  if (tabs.some((t) => t.verdict === "agent")) return "agent";
  if (tabs.some((t) => t.verdict === "human")) return "human";
  return "unknown";
}

/** The tab a visit's row opens: the most recent tab an agent drove, if any, else the most recent tab. */
export function leadTab<T extends { verdict: Verdict; lastAt: number; startedAt: number }>(tabs: readonly T[]): T {
  const lead = mostRecent(tabs.filter((t) => t.verdict === "agent")) ?? mostRecent(tabs);
  if (!lead) throw new Error("A visit has at least one tab");
  return lead;
}

/** The strongest outcome across tabs (see OUTCOME_RANK), or null when no tab had one. */
export function strongestOutcome(outcomes: readonly (Outcome | null)[]): Outcome | null {
  let best: Outcome | null = null;
  for (const o of outcomes) if (o !== null && (best === null || OUTCOME_RANK.indexOf(o) < OUTCOME_RANK.indexOf(best))) best = o;
  return best;
}

/**
 * Roll a visit's tab rows up into one row. It is the lead tab's row (so it links there), except:
 * - verdict: agent > person > undecided across tabs; an undecided tab never drags a person's visit to undecided;
 * - driver: the agent's name, or "2 agents" when tabs had different ones;
 * - confidence: the lead agent tab's, or for a person the most recent person tab's;
 * - outcome: the strongest across tabs; live if any tab is; started at the first tab, last action from the latest.
 */
export function rollUp<R extends RollupTab>(tabs: readonly R[]): VisitRow<R> {
  const lead = leadTab(tabs);
  const latest = mostRecent(tabs)!;
  const first = [...tabs].sort(byStart)[0]!;
  const verdict = visitVerdict(tabs);
  const agentTabs = tabs.filter((t) => t.verdict === "agent");
  const agents = new Set(agentTabs.map((t) => t.driverId ?? "")).size;
  const person = verdict === "human" ? mostRecent(tabs.filter((t) => t.verdict === "human")) : undefined;
  return {
    ...lead,
    verdict,
    driver: agents > 1 ? `${agents} agents` : lead.driver,
    driverId: agents > 1 ? null : lead.driverId,
    confidence: person ? person.confidence : lead.confidence,
    startedAt: first.startedAt,
    lastAt: latest.lastAt,
    live: tabs.some((t) => t.live),
    outcome: strongestOutcome(tabs.map((t) => t.outcome)),
    last: latest.last,
    visit: { id: first.id, tabs: tabs.length, agentTabs: agentTabs.length, agents },
  };
}

/** "Agent in 1 of 3 tabs", "Agent in both tabs", "Agent in all 3 tabs". */
export function agentTabsLabel(agentTabs: number, tabs: number): string {
  if (agentTabs < tabs) return `Agent in ${agentTabs} of ${tabs} tabs`;
  return tabs === 2 ? "Agent in both tabs" : `Agent in all ${tabs} tabs`;
}

// ───────────────────────── The list ─────────────────────────

export interface VisitCounts {
  all: number;
  agent: number;
  human: number;
  unknown: number;
}

/**
 * The Sessions list: group sessions into visits, keep the visits where every test passes on at least one tab, count
 * them by rolled-up verdict, then return the most recently active first (up to `limit`) as rolled-up rows.
 */
export function visitList<S extends GroupTab & { verdict: Verdict }, R extends RollupTab>(
  sessions: readonly S[],
  opts: { toRow: (s: S) => R; verdict?: Verdict | "all"; tests?: readonly ((s: S) => boolean)[]; limit?: number; gap?: number },
): { rows: VisitRow<R>[]; total: number; counts: VisitCounts } {
  const tests = opts.tests ?? [];
  const visits = groupVisits(sessions, opts.gap).filter((v) => tests.every((test) => v.some(test)));
  const counts: VisitCounts = { all: visits.length, agent: 0, human: 0, unknown: 0 };
  const verdicts = new Map<S[], Verdict>();
  for (const v of visits) {
    const verdict = visitVerdict(v);
    verdicts.set(v, verdict);
    counts[verdict]++;
  }
  const shown = !opts.verdict || opts.verdict === "all" ? visits : visits.filter((v) => verdicts.get(v) === opts.verdict);
  const activity = new Map(shown.map((v) => [v, mostRecent(v)!]));
  shown.sort((a, b) => byRecency(activity.get(a)!, activity.get(b)!));
  const limit = Math.max(1, Math.floor(opts.limit ?? 100));
  return { rows: shown.slice(0, limit).map((v) => rollUp(v.map(opts.toRow))), total: shown.length, counts };
}
