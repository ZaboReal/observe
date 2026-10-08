import type { Outcome, Verdict } from "./types";

const nf = new Intl.NumberFormat("en-US");

export function num(n: number): string {
  return nf.format(Math.round(n));
}

export function pct(part: number, whole: number, digits = 0): string {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toFixed(digits)}%`;
}

export function ago(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 30) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

export function hours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(h < 10 ? 1 : 0)}h`;
}

export function clock(t: number): string {
  return new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function clockSeconds(t: number): string {
  return new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function dateTime(t: number): string {
  return new Date(t).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
}

export const TIER_LABEL: Record<string, string> = {
  human: "Person",
  verified: "Verified",
  recognised: "Recognised",
  "unknown-automation": "Unknown automation",
  unknown: "Undecided",
};

export const KIND_LABEL: Record<string, string> = {
  extension: "Browser extension",
  "agentic-browser": "Agentic browser",
  "built-in-agent": "Built-in agent",
  framework: "Automation framework",
  "cloud-browser": "Cloud browser",
  "os-cua": "Computer use",
};

/** Who drove, in words. Undecided is its own thing: never shown as a person. */
export const VERDICT_LABEL: Record<Verdict, string> = { agent: "Agent", human: "Person", unknown: "Undecided" };

/** What the rules did with an agent action, in the past tense, and the pill it wears. */
export const OUTCOME_PAST: Record<Outcome, string> = {
  admit: "Allowed",
  slow: "Slowed",
  request_access: "Asked",
  ask: "Asked",
  reroute: "Rerouted",
  bill: "Billed",
  refuse: "Blocked",
};

/** Longer wording for filters and tooltips, where the two kinds of asking need telling apart. */
export const OUTCOME_LONG: Record<Outcome, string> = {
  admit: "Allowed",
  slow: "Slowed down",
  request_access: "Asked for access",
  ask: "Asked the person",
  reroute: "Rerouted",
  bill: "Billed",
  refuse: "Blocked",
};

export type Tone = "ok" | "ask" | "no" | "mute";

export const OUTCOME_TONE: Record<Outcome, Tone> = {
  admit: "ok",
  slow: "ask",
  request_access: "ask",
  ask: "ask",
  reroute: "ask",
  bill: "mute",
  refuse: "no",
};

/** Strongest first: a session's status is the strongest outcome among its agent actions. */
export const OUTCOME_RANK: Outcome[] = ["refuse", "ask", "request_access", "reroute", "slow", "bill", "admit"];

/** Account id the console gives sessions whose visitor never signed in. */
export const UNASSIGNED_ACCOUNT = "acct_unassigned";

/**
 * A person as the console shows them. Sessions from visitors who never signed in carry `device:<id>`
 * as their user, so they read as "Visitor" with a short device id instead.
 */
export function personOf(email: string): { label: string; device: string | null } {
  if (!email.startsWith("device:")) return { label: email, device: null };
  const id = email.slice("device:".length).replace(/^d_/, "");
  return { label: "Visitor", device: id.slice(0, 6) };
}

/** One line: "morgan@acme.com" or "Visitor 3fa2c1". */
export function personText(email: string): string {
  const p = personOf(email);
  return p.device ? `${p.label} ${p.device}` : p.label;
}

export function accountText(id: string, name: string): string {
  return id === UNASSIGNED_ACCOUNT ? "Not signed in" : name;
}

/** Avatar tile colours by agent maker; anything else is ink. */
const PROVIDER_COLOR: Record<string, string> = {
  Anthropic: "#d97757",
  OpenAI: "#101215",
  Perplexity: "#20808d",
  Google: "#3b78e7",
  Microsoft: "#0f6cbd",
  Manus: "#5b4bc4",
  "Browser Use": "#c2412d",
  Browserbase: "#a5641c",
  OpenClaw: "#1c7a5e",
};

export function providerColor(provider: string | null | undefined): string {
  return (provider && PROVIDER_COLOR[provider]) || "#33363b";
}
