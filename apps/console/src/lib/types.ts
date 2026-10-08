/**
 * Console domain types. Verdicts, tiers, driver kinds and robustness come from the sensor so both sides agree.
 */

import type { DriverKind, Robustness, Tier, Verdict } from "@observe/sensor";

export type { DriverKind, Robustness, Tier, Verdict };

export interface Reason {
  id: string;
  label: string;
  /** Log-odds contribution: positive points to an agent, negative to a person. */
  weight: number;
  /** Missing when the sensor sent only the rule id. */
  robustness?: Robustness;
  detail?: string;
  t: number;
}

export interface Handoff {
  /** Milliseconds since the sensor started on the page. */
  t: number;
  actionIndex: number;
  from: Verdict;
  to: Verdict;
}

export interface Driver {
  id: string;
  name: string;
  provider: string;
  kind: DriverKind;
  /** How sessions from this driver are usually identified. */
  tier: "verified" | "recognised" | "unknown-automation";
}

/** Product-language scopes a visa can grant. Ordered from least to most sensitive. */
export type Scope = "view" | "export" | "edit" | "invite" | "send" | "pay" | "settings" | "delete";

export type Risk = "low" | "medium" | "high" | "critical";

/** What the default policy would do with an action. Computed in observe mode, never enforced here. */
export type Outcome = "admit" | "slow" | "request_visa" | "ask" | "reroute" | "bill" | "refuse";

export interface ActionDef {
  id: string;
  label: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  /** Page the action is taken from. */
  route: string;
  scope: Scope;
  risk: Risk;
}

export interface Account {
  id: string;
  name: string;
  domain: string;
  plan: "Starter" | "Growth" | "Enterprise";
  seats: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  accountId: string;
}

/** What settled a sensor session's verdict, strongest first. */
export type DecidedBy = "signature" | "exact-match" | "jev" | "rules";

export interface Session {
  id: string;
  userId: string;
  accountId: string;
  startedAt: number;
  /** Planned end; a session is live while `endedAt` is in the future. */
  endedAt: number;
  /** Time of the latest event so far. */
  lastAt: number;
  /** Verdict at the end of the session (or now, if live). */
  verdict: Verdict;
  tier: Tier;
  driverId: string | null;
  /** 0..1, confidence in the verdict. */
  confidence: number;
  /** Ms since start when an agent took over, if it did mid-session. */
  handoffAt: number | null;
  /** Number of actions taken, split by who drove. */
  humanActions: number;
  agentActions: number;
  /** Agent actions by scope. */
  scopes: Partial<Record<Scope, number>>;
  device: string;
  /** Came in through the sensor rather than the demo generator. */
  source: "demo" | "sensor";
  /** For sensor sessions: what decided the verdict. */
  decidedBy?: DecidedBy;
  seed: number;
}

/**
 * One step in a session, with who drove it: a page view, a product action (export, invite...) or,
 * for sessions reported by the sensor, a raw input (click, typing run, scroll).
 */
export interface SessionEvent {
  t: number;
  type: "page" | "action" | "input";
  route: string;
  action?: ActionDef;
  input?: "click" | "typing" | "scroll" | "form";
  driver: Verdict;
}

export interface EntryLogLine {
  id: string;
  ts: number;
  sessionId: string;
  userId: string;
  accountId: string;
  driverId: string;
  tier: Tier;
  action: ActionDef;
  outcome: Outcome;
  policy: string;
}
