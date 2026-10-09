import { describe, expect, it } from "vitest";

import type { Outcome, Verdict } from "../src/lib/types";
import { VISIT_GAP, agentTabsLabel, groupVisits, leadTab, personKey, rollUp, visitContaining, visitList, visitVerdict } from "../src/lib/visits";

const MIN = 60_000;

interface T {
  id: string;
  userId: string;
  siteId?: string;
  startedAt: number;
  lastAt: number;
  verdict: Verdict;
  driver: string | null;
  driverId: string | null;
  confidence: number;
  live: boolean;
  outcome: Outcome | null;
  last: { action: string | null; route: string } | null;
}

/** A tab opened `start` minutes in, last active `end` minutes in. */
function tab(id: string, start: number, end: number, over: Partial<T> = {}): T {
  return {
    id,
    userId: "device:d_3b8ab9f0",
    startedAt: start * MIN,
    lastAt: end * MIN,
    verdict: "human",
    driver: null,
    driverId: null,
    confidence: 0.9,
    live: false,
    outcome: null,
    last: { action: null, route: `/${id}` },
    ...over,
  };
}

const agent = (id: string, start: number, end: number, driverId = "claude-in-chrome", over: Partial<T> = {}) =>
  tab(id, start, end, { verdict: "agent", driverId, driver: driverId === "comet" ? "Comet" : "Claude in Chrome", confidence: 0.95, outcome: "admit", ...over });

const ids = (visits: T[][]) => visits.map((v) => v.map((t) => t.id));

describe("personKey", () => {
  it("keeps visitors and signed-in people, drops ids that many browsers would share", () => {
    expect(personKey("device:d_3b8ab9f0")).toBe("device:d_3b8ab9f0");
    expect(personKey("usr_42")).toBe("usr_42");
    expect(personKey("device:unknown")).toBeNull();
    expect(personKey("device:")).toBeNull();
    expect(personKey("")).toBeNull();
    expect(personKey(null)).toBeNull();
  });
});

describe("groupVisits", () => {
  it("chains tabs that open within 30 minutes of the visit's latest activity", () => {
    // b opens exactly 30 minutes after a's last activity, c 30 minutes after b's.
    const visits = groupVisits([tab("a", 0, 10), tab("b", 40, 45), tab("c", 75, 80)]);
    expect(ids(visits)).toEqual([["a", "b", "c"]]);
  });

  it("starts a new visit once the gap is longer than 30 minutes", () => {
    const visits = groupVisits([tab("a", 0, 10), tab("b", 40, 45), tab("c", 75 + 1 / MIN, 80)]);
    expect(ids(visits)).toEqual([["a", "b"], ["c"]]);
    expect(VISIT_GAP).toBe(30 * MIN);
  });

  it("measures the gap from the latest activity seen in the visit, not the previous tab's", () => {
    // b opened and went quiet inside a; a stayed active until minute 50, so c (minute 75) still joins.
    const visits = groupVisits([tab("a", 0, 50), tab("b", 5, 6), tab("c", 75, 76)]);
    expect(ids(visits)).toEqual([["a", "b", "c"]]);
  });

  it("orders tabs by when they opened, whatever order they come in", () => {
    const visits = groupVisits([tab("c", 20, 21), tab("a", 0, 5), tab("b", 10, 12)]);
    expect(ids(visits)).toEqual([["a", "b", "c"]]);
  });

  it("never merges different visitors, or the same visitor on different sites", () => {
    const visits = groupVisits([
      tab("a", 0, 10),
      tab("b", 2, 12, { userId: "device:d_77aa01" }),
      tab("c", 4, 14, { userId: "usr_morgan" }),
      tab("d", 5, 15, { siteId: "other" }),
    ]);
    expect(ids(visits)).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });

  it("leaves sessions without a usable person on their own", () => {
    const visits = groupVisits([tab("a", 0, 10, { userId: "device:unknown" }), tab("b", 1, 11, { userId: "device:unknown" }), tab("c", 2, 12, { userId: "" })]);
    expect(ids(visits)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("finds the visit a session belongs to", () => {
    const all = [tab("a", 0, 10), tab("b", 20, 25), tab("c", 200, 210)];
    expect(visitContaining(all, "b")?.map((t) => t.id)).toEqual(["a", "b"]);
    expect(visitContaining(all, "c")?.map((t) => t.id)).toEqual(["c"]);
    expect(visitContaining(all, "zzz")).toBeNull();
  });
});

describe("rollUp", () => {
  it("is the agent when any tab is an agent, and says in how many tabs", () => {
    const row = rollUp([tab("a", 0, 10), agent("b", 2, 8), tab("c", 4, 12, { verdict: "unknown", confidence: 0.5 })]);
    expect(row.verdict).toBe("agent");
    expect(row.driver).toBe("Claude in Chrome");
    expect(row.confidence).toBe(0.95);
    expect(row.visit).toMatchObject({ tabs: 3, agentTabs: 1, agents: 1 });
    expect(agentTabsLabel(row.visit.agentTabs, row.visit.tabs)).toBe("Agent in 1 of 3 tabs");
  });

  it("counts different agents instead of naming one", () => {
    const row = rollUp([agent("a", 0, 10), agent("b", 2, 8, "comet")]);
    expect(row.driver).toBe("2 agents");
    expect(row.driverId).toBeNull();
    expect(agentTabsLabel(row.visit.agentTabs, row.visit.tabs)).toBe("Agent in both tabs");
  });

  it("is a person, with that tab's confidence, even next to an undecided tab", () => {
    const row = rollUp([tab("a", 0, 10, { confidence: 0.82 }), tab("b", 5, 20, { verdict: "unknown", confidence: 0.5 })]);
    expect(row.verdict).toBe("human");
    expect(row.confidence).toBe(0.82);
  });

  it("is undecided only when no tab is decided", () => {
    expect(visitVerdict([{ verdict: "unknown" }, { verdict: "unknown" }])).toBe("unknown");
    expect(visitVerdict([{ verdict: "unknown" }, { verdict: "human" }])).toBe("human");
    expect(visitVerdict([{ verdict: "human" }, { verdict: "agent" }, { verdict: "unknown" }])).toBe("agent");
  });

  it("takes the strongest status, the latest action, and live from any tab", () => {
    const row = rollUp([
      agent("a", 0, 10, "claude-in-chrome", { outcome: "admit" }),
      agent("b", 2, 30, "claude-in-chrome", { outcome: "refuse", live: true }),
      tab("c", 4, 20, { last: { action: "Exported invoices", route: "/billing" } }),
    ]);
    expect(row.outcome).toBe("refuse");
    expect(row.live).toBe(true);
    expect(row.lastAt).toBe(30 * MIN);
    expect(row.startedAt).toBe(0);
    expect(row.last).toEqual({ action: null, route: "/b" });
    expect(row.visit.id).toBe("a");
  });

  it("keeps a lone tab's row as it was", () => {
    const only = agent("a", 0, 10);
    expect(rollUp([only])).toEqual({ ...only, visit: { id: "a", tabs: 1, agentTabs: 1, agents: 1 } });
  });
});

describe("leadTab", () => {
  it("opens the most recent agent tab, even when a person was active later", () => {
    const tabs = [agent("a", 0, 10), agent("b", 2, 15), tab("c", 4, 40)];
    expect(leadTab(tabs).id).toBe("b");
    expect(rollUp(tabs).id).toBe("b");
  });

  it("opens the most recent tab when no agent drove", () => {
    const tabs = [tab("a", 0, 30), tab("b", 5, 12, { verdict: "unknown" }), tab("c", 8, 9)];
    expect(leadTab(tabs).id).toBe("a");
  });
});

describe("visitList", () => {
  const toRow = (t: T) => t;
  const sessions = [
    tab("a1", 0, 10),
    agent("a2", 3, 12),
    tab("b1", 1, 50, { userId: "device:d_77aa01" }),
    tab("c1", 2, 4, { userId: "device:d_c0ffee", verdict: "unknown" }),
    tab("c2", 3, 5, { userId: "device:d_c0ffee" }),
  ];

  it("gives one row per visit, most recently active first, counted by the rolled-up verdict", () => {
    const { rows, total, counts } = visitList(sessions, { toRow });
    expect(rows.map((r) => r.id)).toEqual(["b1", "a2", "c2"]);
    expect(rows.map((r) => r.visit.tabs)).toEqual([1, 2, 2]);
    expect(total).toBe(3);
    expect(counts).toEqual({ all: 3, agent: 1, human: 2, unknown: 0 });
  });

  it("filters on the rolled-up verdict, and keeps a visit when any tab passes a test", () => {
    expect(visitList(sessions, { toRow, verdict: "agent" }).rows.map((r) => r.id)).toEqual(["a2"]);
    expect(visitList(sessions, { toRow, verdict: "unknown" }).rows).toEqual([]);
    const found = visitList(sessions, { toRow, tests: [(s) => s.id === "a1"] });
    expect(found.rows.map((r) => r.id)).toEqual(["a2"]);
    expect(found.counts).toEqual({ all: 1, agent: 1, human: 0, unknown: 0 });
  });

  it("stops at the limit but reports the total", () => {
    const { rows, total } = visitList(sessions, { toRow, limit: 1 });
    expect(rows).toHaveLength(1);
    expect(total).toBe(3);
  });
});
