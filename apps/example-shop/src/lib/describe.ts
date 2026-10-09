import type { ObserveDecision, ObserveOutcome } from "@observe/next";

const WOULD: Record<ObserveOutcome, string> = {
  admit: "would allow",
  slow: "would slow down",
  request_access: "would ask for access",
  ask: "would ask the person",
  reroute: "would reroute",
  bill: "would bill",
  refuse: "would block",
};

/** "Observe: agent · Claude in Chrome · would ask for access", or "… · would bill $0.25" under agent pricing */
export function describeDecision(d: ObserveDecision): string {
  const parts: string[] = [d.verdict];
  if (d.verdict === "agent") parts.push(d.driver?.name ?? "unrecognised agent");
  parts.push(d.outcome === "bill" && d.price ? `${WOULD.bill} ${d.price.display}` : (WOULD[d.outcome] ?? d.outcome));
  return `Observe: ${parts.join(" · ")}`;
}

/** The small print: token state, rule, and why the check failed open if it did. */
export function decisionDetail(d: ObserveDecision): string {
  const bits = [`token ${d.token}`];
  if (d.policy) bits.push(`rule ${d.policy}`);
  if (d.confidence) bits.push(`${Math.round(d.confidence * 100)}% sure`);
  if (d.error) bits.push(`failed open: ${d.error}`);
  return bits.join(" · ");
}
