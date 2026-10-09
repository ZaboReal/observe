import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { agentMs, billable, sessionBill } = await import("../src/lib/billing");
const { rateFor, setLocalRate, setStoredRates } = await import("../src/lib/pricing");
const { formatMinutes } = await import("../src/lib/money");
import type { Session } from "../src/lib/types";

const SITE = "billing-test";
const T0 = 1_800_000_000_000;

function session(over: Partial<Session> = {}): Session {
  return {
    id: "s_billing_none",
    userId: "device:d_test",
    accountId: "acct_unassigned",
    startedAt: T0,
    endedAt: T0 + 3_600_000,
    lastAt: T0 + 4.5 * 60_000,
    verdict: "agent",
    tier: "recognised",
    driverId: "claude-in-chrome",
    confidence: 0.99,
    handoffAt: null,
    humanActions: 0,
    agentActions: 3,
    scopes: {},
    device: "Device d_test",
    source: "sensor",
    seed: 1,
    ...over,
  };
}

describe("agent billing by time and session", () => {
  setStoredRates([
    { site: SITE, unit: "hour", amount_micro: "2000000" },
    { site: SITE, unit: "session", amount_micro: 100_000 },
  ]);

  it("loads rates per site", () => {
    expect(rateFor(SITE, "hour")).toBe(2_000_000);
    expect(rateFor(SITE, "session")).toBe(100_000);
    expect(rateFor("other", "hour")).toBeNull();
  });

  it("bills each started minute of agent time, plus the session", () => {
    const b = sessionBill(SITE, session(), T0 + 3_600_000);
    expect(b.minutes).toBe(5);
    expect(b.time).toBe(Math.round((2_000_000 * 5) / 60));
    expect(b.session).toBe(100_000);
    expect(b.total).toBe(b.time + b.session + b.actions);
  });

  it("starts the clock when an agent takes over", () => {
    expect(agentMs(session({ handoffAt: 2 * 60_000 }))).toBe(2.5 * 60_000);
  });

  it("never bills people, undecided sessions or unknown automation", () => {
    for (const s of [session({ verdict: "human", tier: "human" }), session({ verdict: "unknown", tier: "unknown" }), session({ tier: "unknown-automation" })]) {
      expect(billable(s)).toBe(false);
      expect(sessionBill(SITE, s, T0 + 3_600_000).total).toBe(0);
    }
  });

  it("stops charging when a rate is removed", () => {
    setLocalRate(SITE, "hour", null);
    expect(sessionBill(SITE, session(), T0 + 3_600_000).time).toBe(0);
  });

  it("prints agent time", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(120)).toBe("2 h");
    expect(formatMinutes(134)).toBe("2 h 14 min");
  });
});
