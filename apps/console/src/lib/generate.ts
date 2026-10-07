import { ACCOUNTS, ACTIONS, DRIVERS, UNNAMED_SHARE, USERS, canTakeOver, getAction, getDriver, getUser, type UserProfile } from "./catalog";
import { between, hash, int, logNormal, mulberry32, pick, poisson, weighted, type Rng } from "./random";
import type { Reason, Scope, Session, SessionEvent, Tier, Verdict } from "./types";

/**
 * Demo traffic. Sessions are generated per minute from a seed derived from the minute itself, so the
 * same minute always yields the same sessions and "now" reveals new ones as the clock moves.
 */

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Agent traffic grows a few percent a day from this date, so the trend lines go somewhere. */
const GROWTH_EPOCH = Date.UTC(2026, 8, 1);

const usersByAccount = new Map<string, UserProfile[]>();
for (const user of USERS) {
  const list = usersByAccount.get(user.accountId) ?? [];
  list.push(user);
  usersByAccount.set(user.accountId, list);
}

/** Expected sessions per minute for each verdict at time `t`. */
export function rates(t: number): Record<Verdict, number> {
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const workday = Math.exp(-((h - 13) ** 2) / (2 * 3.1 ** 2));
  const evening = Math.exp(-((h - 21) ** 2) / (2 * 1.8 ** 2));
  const growth = 1 + Math.max(0, (t - GROWTH_EPOCH) / DAY) * 0.006;
  return {
    human: (0.5 + 4.2 * workday + 0.6 * evening) * (weekend ? 0.3 : 1),
    // Agents keep working when people stop; part of their traffic is scheduled overnight.
    agent: (0.22 + 0.62 * workday + 0.16 * evening) * (weekend ? 0.7 : 1) * growth,
    unknown: (0.06 + 0.14 * workday) * (weekend ? 0.5 : 1),
  };
}

export function sessionsInMinute(bucket: number): Session[] {
  const rng = mulberry32(hash(`minute:${bucket}`));
  const start = bucket * MINUTE;
  const r = rates(start);
  const sessions: Session[] = [];
  let i = 0;
  for (const verdict of ["human", "agent", "unknown"] as const) {
    const n = poisson(rng, r[verdict]);
    for (let k = 0; k < n; k++) {
      sessions.push(buildSession(hash(`${bucket}:${i++}`), start + Math.floor(rng() * MINUTE), verdict));
    }
  }
  return sessions.sort((a, b) => a.startedAt - b.startedAt);
}

function buildSession(seed: number, startedAt: number, verdict: Verdict): Session {
  const rng = mulberry32(seed);
  let user: UserProfile;
  let driverId: string | null = null;

  if (verdict === "agent") {
    const account = weighted(rng, ACCOUNTS, (a) => a.seats * (0.04 + a.agentAffinity));
    // Squared, so most agent work comes from the few people who rely on agents.
    user = weighted(rng, usersByAccount.get(account.id)!, (u) => 0.01 + u.agentAffinity ** 2);
    if (rng() * 100 < UNNAMED_SHARE) driverId = null;
    else driverId = rng() < 0.82 ? user.preferredDriver : weighted(rng, DRIVERS, (d) => d.share).id;
  } else {
    const account = weighted(rng, ACCOUNTS, (a) => a.seats);
    user = pick(rng, usersByAccount.get(account.id)!);
  }

  const events = buildEvents({ seed, verdict, driverId, userId: user.id });
  const last = events[events.length - 1]!;
  const driver = getDriver(driverId);
  const tier: Tier =
    verdict === "human" ? "human" : verdict === "unknown" ? "unknown" : driver ? driver.tier : "unknown-automation";

  return {
    id: `ses_${seed.toString(36).padStart(7, "0")}`,
    userId: user.id,
    accountId: user.accountId,
    startedAt,
    endedAt: startedAt + last.t + Math.round(between(rng, 1, 6) * MINUTE),
    lastAt: startedAt + last.t,
    verdict,
    tier,
    driverId,
    confidence: confidenceFor(rng, tier),
    ...summarise(events),
    device: deviceFor(rng, verdict, driverId),
    source: "demo",
    seed,
  };
}

/** Counts derived from a session's events. Used for full sessions and for live sessions cut off at now. */
export function summarise(events: SessionEvent[]) {
  let humanActions = 0;
  let agentActions = 0;
  let handoffAt: number | null = null;
  let sawHuman = false;
  const scopes: Partial<Record<Scope, number>> = {};
  for (const e of events) {
    // A takeover is a person followed by an agent; "unknown" only means not decided yet.
    if (e.driver === "agent") {
      if (sawHuman && handoffAt === null) handoffAt = e.t;
    } else if (e.driver === "human") sawHuman = true;
    if (e.type === "page") continue;
    if (e.driver === "agent") {
      agentActions++;
      if (e.action) scopes[e.action.scope] = (scopes[e.action.scope] ?? 0) + 1;
    } else humanActions++;
  }
  return { humanActions, agentActions, scopes, handoffAt };
}

function confidenceFor(rng: Rng, tier: Tier): number {
  switch (tier) {
    case "verified":
      return 1;
    case "recognised":
      return between(rng, 0.86, 0.995);
    case "unknown-automation":
      return between(rng, 0.72, 0.93);
    case "human":
      return between(rng, 0.9, 0.995);
    default:
      return between(rng, 0.42, 0.64);
  }
}

const HUMAN_DEVICES = ["Chrome · macOS", "Chrome · Windows", "Safari · macOS", "Edge · Windows", "Firefox · Windows", "Arc · macOS"];

function deviceFor(rng: Rng, verdict: Verdict, driverId: string | null): string {
  if (verdict !== "agent") return pick(rng, HUMAN_DEVICES);
  switch (driverId) {
    case "comet":
      return "Comet · macOS";
    case "edge-copilot":
      return "Edge · Windows";
    case "chatgpt-agent":
    case "stagehand":
      return "Cloud browser · us-east-1";
    case "browser-use":
    case "playwright":
    case null:
      return "Headless Chrome · Linux";
    default:
      return rng() < 0.7 ? "Chrome · macOS" : "Chrome · Windows";
  }
}

// ───────────────────────── Events ─────────────────────────

interface TaskStep {
  route: string;
  action: string;
  min: number;
  max: number;
}

/** Jobs agents are given in the demo. Each is a short run of actions on one or two pages. */
const TASKS: { weight: number; steps: TaskStep[] }[] = [
  { weight: 20, steps: [{ route: "/dashboard", action: "view_dashboard", min: 1, max: 1 }, { route: "/reports", action: "view_report", min: 3, max: 8 }] },
  { weight: 18, steps: [{ route: "/reports", action: "view_report", min: 2, max: 6 }, { route: "/reports", action: "export_report", min: 1, max: 2 }] },
  { weight: 12, steps: [{ route: "/invoices", action: "search_invoices", min: 1, max: 3 }, { route: "/invoices", action: "edit_invoice", min: 2, max: 8 }, { route: "/invoices", action: "send_invoice", min: 0, max: 3 }] },
  { weight: 10, steps: [{ route: "/invoices", action: "search_invoices", min: 1, max: 2 }, { route: "/invoices", action: "send_invoice", min: 2, max: 6 }] },
  { weight: 10, steps: [{ route: "/customers", action: "view_customer", min: 3, max: 10 }, { route: "/customers", action: "update_customer", min: 1, max: 5 }] },
  { weight: 8, steps: [{ route: "/invoices", action: "search_invoices", min: 1, max: 2 }, { route: "/invoices", action: "export_invoices", min: 1, max: 1 }] },
  { weight: 6, steps: [{ route: "/customers", action: "view_customer", min: 2, max: 5 }, { route: "/customers", action: "export_customers", min: 1, max: 1 }] },
  { weight: 5, steps: [{ route: "/invoices", action: "create_invoice", min: 1, max: 4 }] },
  { weight: 4, steps: [{ route: "/settings/team", action: "invite_member", min: 1, max: 3 }, { route: "/settings/team", action: "change_role", min: 0, max: 1 }] },
  { weight: 3, steps: [{ route: "/reports", action: "share_report", min: 1, max: 2 }] },
  { weight: 2, steps: [{ route: "/dashboard", action: "view_dashboard", min: 1, max: 1 }, { route: "/payroll", action: "run_payroll", min: 1, max: 1 }] },
  { weight: 2, steps: [{ route: "/payments", action: "issue_refund", min: 1, max: 3 }] },
  { weight: 1.5, steps: [{ route: "/customers", action: "view_customer", min: 2, max: 4 }, { route: "/customers", action: "delete_customer", min: 1, max: 3 }] },
  { weight: 1, steps: [{ route: "/settings/api-keys", action: "create_api_key", min: 1, max: 1 }, { route: "/settings/security", action: "change_sso", min: 0, max: 1 }] },
  { weight: 0.5, steps: [{ route: "/invoices", action: "delete_invoices", min: 1, max: 1 }] },
];

/** Unnamed automation in the demo mostly scrapes. */
const SCRAPES: TaskStep[][] = [
  [{ route: "/reports", action: "view_report", min: 10, max: 40 }],
  [{ route: "/customers", action: "view_customer", min: 10, max: 30 }, { route: "/customers", action: "export_customers", min: 0, max: 1 }],
  [{ route: "/invoices", action: "search_invoices", min: 8, max: 25 }],
];

const HUMAN_SCOPE_WEIGHT: Record<Scope, number> = {
  view: 70,
  edit: 15,
  export: 5,
  send: 4,
  invite: 2,
  settings: 2,
  pay: 1.5,
  delete: 0.5,
};

/** Rebuild a demo session's events from its seed. Pure: the same inputs always give the same events. */
export function buildEvents({ seed, verdict, driverId, userId }: Pick<Session, "seed" | "verdict" | "driverId" | "userId">): SessionEvent[] {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const events: SessionEvent[] = [];
  let t = 0;
  let route = "/dashboard";
  events.push({ t, type: "page", route, driver: verdict === "agent" ? "agent" : verdict });

  const driver = getDriver(driverId);
  const takeover = verdict === "agent" && driver !== undefined && canTakeOver(driver) && rng() < 0.55;

  if (verdict === "unknown") {
    for (let i = int(rng, 1, 3); i > 0; i--) {
      t += Math.round(logNormal(rng, 9, 0.6) * SECOND);
      events.push(humanStep(rng, t, route, "unknown"));
    }
    return events;
  }

  if (verdict === "human" || takeover) {
    events[0]!.driver = "human";
    const steps = verdict === "human" ? Math.round(Math.min(60, Math.max(2, logNormal(rng, 11, 0.7)))) : int(rng, 2, 7);
    for (let i = 0; i < steps; i++) {
      t += Math.round(Math.min(300, Math.max(2, logNormal(rng, 24, 0.8))) * SECOND);
      const step = humanStep(rng, t, route, "human");
      route = step.route;
      events.push(step);
    }
    if (verdict === "human") return events;
    // The person hands over: a pause while they type the instruction into their agent.
    t += Math.round(between(rng, 8, 40) * SECOND);
  }

  // People who lean on agents hand them long jobs: working through a backlog for half an hour or more.
  const long = rng() < 0.08 + 0.5 * (getUser(userId)?.agentAffinity ?? 0);
  const count = long ? int(rng, 6, 30) : int(rng, 1, 4);
  // On long jobs the agent reads more between actions, so it moves slower.
  const pace = long ? 1.8 : 1;
  const jobs = driverId === null ? [pick(rng, SCRAPES)] : Array.from({ length: count }, () => weighted(rng, TASKS, (x) => x.weight).steps);
  for (const job of jobs) {
    if (long) t += Math.round(between(rng, 4, 25) * SECOND);
    for (const step of job) {
      if (step.route !== route) {
        t += Math.round(between(rng, 1.2, 4) * SECOND);
        route = step.route;
        events.push({ t, type: "page", route, driver: "agent" });
      }
      for (let n = int(rng, step.min, step.max); n > 0; n--) {
        t += Math.round(Math.min(45, Math.max(0.8, logNormal(rng, 4.5 * pace, 0.55))) * SECOND);
        events.push({ t, type: "action", route, action: getAction(step.action), driver: "agent" });
      }
    }
  }
  return events;
}

function humanStep(rng: Rng, t: number, route: string, driver: Verdict): SessionEvent {
  if (rng() < 0.3) {
    const next = pick(rng, ["/dashboard", "/reports", "/reports", "/invoices", "/invoices", "/customers", "/settings/team", "/payroll"]);
    if (next !== route) return { t, type: "page", route: next, driver };
  }
  const here = ACTIONS.filter((a) => a.route === route);
  const options = here.length > 0 ? here : ACTIONS.filter((a) => a.route === "/dashboard");
  const action = weighted(rng, options, (a) => HUMAN_SCOPE_WEIGHT[a.scope]);
  return { t, type: "action", route, action, driver };
}

// ───────────────────────── Passport reasons ─────────────────────────

type ReasonTemplate = Omit<Reason, "t">;

const HUMAN_REASONS: ReasonTemplate[] = [
  { id: "pointer.curved", label: "Curved pointer approach with overshoot", weight: -1.9, robustness: "medium", detail: "straightness 0.71" },
  { id: "keys.rollover", label: "Overlapping key presses while typing", weight: -1.4, robustness: "medium", detail: "11 rollovers" },
  { id: "click.press_varied", label: "Press duration varies like a finger", weight: -0.9, robustness: "low", detail: "68–142 ms" },
  { id: "pointer.idle_moves", label: "Pointer drifts between actions", weight: -0.7, robustness: "low", detail: "214 idle moves" },
  { id: "scroll.inertia", label: "Trackpad scroll with inertia", weight: -0.5, robustness: "low" },
];

/** Evidence by driver, written from the mechanics in the sensor's driver registry. */
const AGENT_REASONS: Record<string, ReasonTemplate[]> = {
  "claude-in-chrome": [
    { id: "dom.active_overlay", label: "Agent overlay on the page", weight: 4.2, robustness: "decisive", detail: "claude-agent-glow-border" },
    { id: "typing.insert_no_key", label: "Characters inserted one at a time with no key presses", weight: 2.6, robustness: "high", detail: "48 chars, 0 keydowns" },
    { id: "pointer.teleport", label: "Pointer jumps straight to the target", weight: 2.1, robustness: "high", detail: "349 px jump" },
    { id: "click.press_short", label: "Press to release under 6 ms", weight: 1.2, robustness: "medium", detail: "2 ms" },
    { id: "click.centre", label: "Clicks land on the exact centre", weight: 1.1, robustness: "medium", detail: "offset 0.02" },
    { id: "scroll.wheel_100", label: "Scrolls in fixed 100 px wheel steps", weight: 0.8, robustness: "low" },
  ],
  "gemini-in-chrome": [
    { id: "typing.keys_sync", label: "Key events dispatched with 0–2 ms gaps", weight: 2.4, robustness: "high", detail: "1 ms median gap" },
    { id: "scroll.no_wheel", label: "Page scrolls with no wheel or touch input", weight: 1.9, robustness: "high", detail: "6 programmatic scrolls" },
    { id: "click.centre", label: "Clicks land on the exact centre", weight: 1.1, robustness: "medium", detail: "offset 0.00" },
    { id: "pointer.no_approach", label: "Press with no pointer movement before it", weight: 1.6, robustness: "medium" },
  ],
  comet: [
    { id: "typing.paste_no_shortcut", label: "Text pasted with no clipboard shortcut", weight: 2.3, robustness: "high", detail: "3 pastes" },
    { id: "pointer.teleport", label: "Pointer jumps straight to the target", weight: 2.1, robustness: "high", detail: "512 px jump" },
    { id: "ua.comet", label: "Browser brand is Comet", weight: 0.4, robustness: "low", detail: "names the browser, not the driver" },
    { id: "cadence.model", label: "Gaps match model response latency", weight: 1.3, robustness: "medium", detail: "3.1 s median" },
  ],
  "chatgpt-extension": [
    { id: "typing.paste_no_shortcut", label: "Text pasted with no clipboard shortcut", weight: 2.3, robustness: "high", detail: "2 pastes" },
    { id: "page.hidden_input", label: "Input arrives while the tab is hidden", weight: 2.0, robustness: "high", detail: "task tab group" },
    { id: "pointer.teleport", label: "Pointer jumps straight to the target", weight: 2.1, robustness: "high", detail: "288 px jump" },
  ],
  "chatgpt-agent": [
    { id: "sig.web_bot_auth", label: "Web Bot Auth signature verified", weight: 9, robustness: "decisive", detail: "chatgpt.com key directory" },
    { id: "pointer.teleport", label: "Pointer jumps straight to the target", weight: 2.1, robustness: "high" },
  ],
  stagehand: [
    { id: "sig.web_bot_auth", label: "Web Bot Auth signature verified", weight: 9, robustness: "decisive", detail: "browserbase.com key directory" },
    { id: "typing.insert_bulk", label: "Whole value inserted in one event", weight: 2.2, robustness: "high" },
    { id: "click.press_short", label: "Press to release under 3 ms", weight: 1.2, robustness: "medium", detail: "0 ms" },
  ],
  "browser-use": [
    { id: "click.fixed_timing", label: "Hover 50 ms, press 80 ms, every click", weight: 2.5, robustness: "high", detail: "σ 3 ms" },
    { id: "typing.key_gap", label: "Key gaps fixed at 3–8 ms", weight: 2.0, robustness: "high" },
    { id: "click.centre", label: "Clicks land on the exact centre", weight: 1.1, robustness: "medium" },
  ],
  playwright: [
    { id: "global.playwright", label: "Playwright binding on window", weight: 6, robustness: "decisive", detail: "__playwright__binding__" },
    { id: "typing.insert_bulk", label: "Whole value inserted in one event", weight: 2.2, robustness: "high" },
  ],
  "manus-operator": [
    { id: "keys.hold_fixed", label: "Key holds fixed near 53 ms", weight: 1.9, robustness: "medium", detail: "σ 4 ms" },
    { id: "scroll.instant", label: "Elements scrolled into view instantly", weight: 1.4, robustness: "medium" },
    { id: "pointer.teleport", label: "Pointer jumps straight to the target", weight: 2.1, robustness: "high" },
  ],
  openclaw: [
    { id: "pointer.teleport", label: "Pointer jumps straight to the target", weight: 2.1, robustness: "high", detail: "406 px jump" },
    { id: "click.press_short", label: "Press to release under 6 ms", weight: 1.2, robustness: "medium" },
    { id: "cadence.model", label: "Gaps match model response latency", weight: 1.3, robustness: "medium", detail: "4.2 s median" },
  ],
  "edge-copilot": [
    { id: "pointer.no_approach", label: "Press with no pointer movement before it", weight: 1.6, robustness: "medium" },
    { id: "cadence.model", label: "Gaps match model response latency", weight: 1.3, robustness: "medium", detail: "2.8 s median" },
    { id: "ua.edge", label: "Browser brand is Microsoft Edge", weight: 0.2, robustness: "low", detail: "names the browser, not the driver" },
  ],
};

const UNNAMED_REASONS: ReasonTemplate[] = [
  { id: "input.untrusted", label: "Untrusted input events with no interaction", weight: 2.2, robustness: "high", detail: "14 events" },
  { id: "pointer.teleport", label: "Pointer jumps straight to the target", weight: 2.1, robustness: "high" },
  { id: "cadence.uniform", label: "Evenly spaced actions", weight: 1.5, robustness: "medium", detail: "σ 40 ms" },
  { id: "driver.none", label: "No known agent matches", weight: 0, robustness: "situational" },
];

/** Reasons behind a demo session's passport, strongest first. */
export function reasonsFor(session: Session): Reason[] {
  const rng = mulberry32(session.seed ^ 0x5bd1e995);
  let list: ReasonTemplate[];
  if (session.verdict === "human") list = HUMAN_REASONS.filter(() => rng() < 0.85);
  else if (session.verdict === "unknown")
    list = [
      { id: "evidence.thin", label: "Too few actions to decide", weight: 0.3, robustness: "situational", detail: `${session.humanActions} actions` },
      HUMAN_REASONS[3]!,
    ];
  else {
    list = session.driverId ? (AGENT_REASONS[session.driverId] ?? UNNAMED_REASONS) : UNNAMED_REASONS;
    if (session.handoffAt !== null) list = [...list, { id: "handoff", label: "Input mechanics changed mid-session", weight: 1.8, robustness: "high", detail: "person → agent" }];
  }
  return list
    .map((r) => ({ ...r, weight: Math.round(r.weight * between(rng, 0.85, 1.15) * 10) / 10, t: 0 }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
}
