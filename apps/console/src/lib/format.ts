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
  human: "Human",
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
