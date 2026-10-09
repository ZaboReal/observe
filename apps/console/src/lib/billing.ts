import "server-only";

import { ruleFor } from "./agent-rules";
import { decide } from "./policy";
import { priceFor, rateFor } from "./pricing";
import { store } from "./store";
import type { Session } from "./types";

/**
 * What agents are billed: per action (observe.prices, through the rules in src/lib/policy.ts), per hour they drive a
 * session and per session (observe.agent_rates). Only recognised and verified agents are billed, the same agents a
 * per-action price reaches; undecided sessions and unknown automation never are.
 */

export interface SessionBill {
  /** Millionths of a dollar. */
  actions: number;
  time: number;
  session: number;
  total: number;
  /** Agent time billed, in whole minutes (each started minute counts). */
  minutes: number;
  /** Billed actions. */
  actionCount: number;
}

export interface AgentBilling {
  actions: number;
  time: number;
  sessions: number;
  total: number;
  minutes: number;
  sessionCount: number;
  actionCount: number;
}

const EMPTY: SessionBill = { actions: 0, time: 0, session: 0, total: 0, minutes: 0, actionCount: 0 };

export function billable(s: Session): boolean {
  return s.verdict === "agent" && (s.tier === "recognised" || s.tier === "verified");
}

/** How long the agent drove: from the start, or from when it took over, to the latest event. */
export function agentMs(s: Session): number {
  return Math.max(0, s.lastAt - (s.startedAt + (s.handoffAt ?? 0)));
}

export function sessionBill(siteId: string, s: Session, now: number): SessionBill {
  if (!billable(s)) return EMPTY;
  let actions = 0;
  let actionCount = 0;
  for (const e of store.events(s, now)) {
    if (e.driver !== "agent" || !e.action) continue;
    const d = decide(s.tier, e.action, priceFor(siteId, e.action.id), ruleFor(siteId, s, e.action.scope));
    if (d.price) {
      actions += d.price;
      actionCount++;
    }
  }
  const hourly = rateFor(siteId, "hour");
  const minutes = hourly ? Math.max(1, Math.ceil(agentMs(s) / 60_000)) : 0;
  const time = hourly ? Math.round((hourly * minutes) / 60) : 0;
  const session = rateFor(siteId, "session") ?? 0;
  return { actions, time, session, total: actions + time + session, minutes, actionCount };
}

/** Everything agents were billed for sessions that started in [from, to]. */
export function agentBilling(siteId: string, from: number, to: number, now = Date.now()): AgentBilling {
  const out: AgentBilling = { actions: 0, time: 0, sessions: 0, total: 0, minutes: 0, sessionCount: 0, actionCount: 0 };
  for (const s of store.sessions(from, to, now, siteId)) {
    if (!billable(s)) continue;
    const b = sessionBill(siteId, s, now);
    out.actions += b.actions;
    out.time += b.time;
    out.sessions += b.session;
    out.total += b.total;
    out.minutes += b.minutes;
    out.actionCount += b.actionCount;
    if (b.session) out.sessionCount++;
  }
  return out;
}
