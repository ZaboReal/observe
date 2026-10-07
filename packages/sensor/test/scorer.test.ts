import { analyzeAction } from "../src/detect/analyze";
import { makeReason } from "../src/detect/rules";
import { Scorer } from "../src/detect/scorer";
import { buildIndex, DRIVERS } from "../src/registry";
import type { ActionRecord } from "../src/capture";
import { agentClick, humanClick, resetIndex, typing } from "./fixtures";

const registry = buildIndex(DRIVERS);

function feed(scorer: Scorer, records: ActionRecord[], history: ActionRecord[] = []): void {
  for (const r of records) {
    scorer.addAction(r.index, analyzeAction(r, history, DRIVERS), r.t);
    history.push(r);
  }
}

beforeEach(() => resetIndex());

describe("Scorer", () => {
  it("stays unknown with a single action", () => {
    const s = new Scorer(registry);
    feed(s, [agentClick()]);
    expect(s.compute(5000).verdict).toBe("unknown");
  });

  it("calls an agent and names Claude in Chrome from mechanics", () => {
    const s = new Scorer(registry);
    feed(s, [agentClick(), typing({ insertNoKey: 9, charsNoKey: 9, insertSingles: 9 }), agentClick(), agentClick()]);
    const p = s.compute(20_000);
    expect(p.verdict).toBe("agent");
    expect(p.tier).toBe("recognised");
    expect(p.driver?.id).toBe("claude-in-chrome");
    expect(p.agentProbability).toBeGreaterThan(0.95);
  });

  it("calls a person a person", () => {
    const s = new Scorer(registry);
    feed(s, [humanClick(), humanClick(), typing({ keys: 9, gaps: [210, 95, 320, 140, 260, 110, 400, 180], holds: [90, 70, 110, 80, 100], rollovers: 1, idleMoves: 30 }), humanClick()]);
    const p = s.compute(20_000);
    expect(p.verdict).toBe("human");
    expect(p.tier).toBe("human");
    expect(p.driver).toBeNull();
  });

  it("reports unknown automation when the agent cannot be named", () => {
    const s = new Scorer(registry);
    // Teleporting clicks with no hover and an instant press, but no product-specific mechanics.
    feed(s, [agentClick({ hoverMs: 0 }), agentClick({ hoverMs: 0 }), typing({ untrustedInputs: 3 }), agentClick({ hoverMs: 0 })]);
    const p = s.compute(20_000);
    expect(p.verdict).toBe("agent");
    expect(["unknown-automation", "recognised"]).toContain(p.tier);
  });

  it("lets decisive evidence override human behaviour", () => {
    const s = new Scorer(registry);
    feed(s, [humanClick(), humanClick(), humanClick()]);
    s.addPersistent("env.webdriver", makeReason("env.webdriver", 100));
    const p = s.compute(20_000);
    expect(p.verdict).toBe("agent");
    expect(p.score).toBeGreaterThanOrEqual(8);
    expect(p.reasons[0]?.id).toBe("env.webdriver");
    expect(p.reasons.every((r) => r.weight >= 0)).toBe(true);
  });

  it("names the driver from an active overlay", () => {
    const s = new Scorer(registry);
    s.addPersistent("artifact.active:claude-in-chrome", makeReason("artifact.active", 50, { drivers: { "claude-in-chrome": 6 } }));
    const p = s.compute(1000);
    expect(p.verdict).toBe("agent");
    expect(p.driver?.id).toBe("claude-in-chrome");
  });

  it("lets an overlay lapse after it disappears", () => {
    const s = new Scorer(registry);
    s.addPersistent("artifact.active:claude-in-chrome", makeReason("artifact.active", 50, { drivers: { "claude-in-chrome": 6 } }));
    s.expirePersistent("artifact.active:claude-in-chrome", 1000, 20_000);
    expect(s.compute(15_000).verdict).toBe("agent");
    expect(s.compute(25_000).verdict).toBe("unknown");
  });

  it("detects a person handing the session to an agent", () => {
    const s = new Scorer(registry);
    const history: ActionRecord[] = [];
    feed(s, [humanClick(), humanClick(), humanClick(), humanClick()], history);
    expect(s.compute(10_000).verdict).toBe("human");
    feed(s, [agentClick(), agentClick(), typing({ insertNoKey: 9, charsNoKey: 9, insertSingles: 9 }), agentClick()], history);
    const p = s.compute(30_000);
    expect(p.handoffs.length).toBe(1);
    expect(p.handoffs[0]).toMatchObject({ from: "human", to: "agent" });
    expect(p.verdict).toBe("agent");
  });
});
