/** Public types for @observe/sensor. */

export type Verdict = "human" | "agent" | "unknown";

/**
 * How much we know about who is driving.
 * `verified` is only ever set from outside the browser (a signed passport from the edge or a handshake).
 */
export type Tier = "human" | "verified" | "recognised" | "unknown-automation" | "unknown";

export type DriverKind =
  | "extension"
  | "agentic-browser"
  | "built-in-agent"
  | "framework"
  | "cloud-browser"
  | "os-cua";

/** How reliable a signal or signature entry is. */
export type Confidence = "source" | "teardown" | "docs" | "secondary" | "unverified" | "lab";

/** How easy a signal is for an agent to remove or fake. */
export type Robustness = "decisive" | "high" | "medium" | "low" | "situational";

export interface Reason {
  /** Stable rule id, e.g. `pointer.teleport`. */
  id: string;
  /** Short human-readable label. */
  label: string;
  /** Log-odds contribution: positive points to an agent, negative to a person. */
  weight: number;
  robustness: Robustness;
  /** Optional observed value, e.g. `"349 px jump"`. */
  detail?: string;
  /** Driver ids this evidence points at, with log-odds weights. */
  drivers?: Record<string, number>;
  /** Evidence that settles the verdict on its own (e.g. `navigator.webdriver`). */
  decisive?: boolean;
  /** Milliseconds since the sensor started. */
  t: number;
}

export interface DriverMatch {
  id: string;
  name: string;
  provider: string;
  kind: DriverKind;
  /** 0..1 */
  confidence: number;
  score: number;
}

export interface Handoff {
  /** Milliseconds since the sensor started when the switch was detected. */
  t: number;
  /** Index of the first action attributed to the new driver. */
  actionIndex: number;
  from: Verdict;
  to: Verdict;
}

export interface Passport {
  verdict: Verdict;
  tier: Tier;
  /** Summed log-odds over the evaluation window. Positive = agent. */
  score: number;
  /** Probability the session is currently agent-driven, from the score. 0..1 */
  agentProbability: number;
  driver: DriverMatch | null;
  candidates: DriverMatch[];
  /** Strongest reasons first. */
  reasons: Reason[];
  handoffs: Handoff[];
  actions: number;
  /** Set when the passport came from a signed source (edge or handshake). */
  source: "behaviour" | "signature" | "handshake";
  updatedAt: number;
}

export interface Identity {
  userId: string | null;
  accountId: string | null;
}

export type CaptureMode =
  /** Aggregated per-action records only. The production default. */
  | "standard"
  /** Also send raw pointer/key timing streams (no values). For the benchmark lab. */
  | "lab";

export interface SensorConfig {
  /** Publishable key. Optional while running local-only. */
  publishableKey?: string;
  /** Collector base URL. When omitted the sensor runs local-only and sends nothing. */
  endpoint?: string;
  capture?: CaptureMode;
  /** Hold all collection until `optIn()` is called. */
  waitForConsent?: boolean;
  /** Render the in-page debug panel (or add `?observe_debug=1` to the URL). */
  debug?: boolean;
  /** Ground-truth label for lab sessions, e.g. `claude-in-chrome`. Also read from `?observe_driver=`. */
  labDriver?: string;
  /** Batch flush interval in ms. */
  flushIntervalMs?: number;
  /** Optional probes that can produce false positives; off by default. */
  probes?: {
    /** Detect a DevTools-protocol client with Runtime enabled. Also fires for developers with DevTools open. Off by default. */
    debugger?: boolean;
    /** Wrap console.log/info/debug to catch automation markers. On by default; log call sites then point at the sensor. */
    console?: boolean;
  };
  /** CSS selector for elements whose untrusted events come from the app's own code and should be ignored. */
  ignoreSyntheticFrom?: string;
  /** Evaluation window (number of recent actions) for the rolling verdict. */
  windowActions?: number;
}

export type SensorEvent =
  | { type: "passport"; passport: Passport }
  | { type: "reason"; reason: Reason }
  | { type: "handoff"; handoff: Handoff };

export interface ProtectedActionSnapshot {
  actionId: string;
  sessionId: string;
  passport: Passport;
  t: number;
}
