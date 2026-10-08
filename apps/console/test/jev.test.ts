import { DRIVERS } from "@observe/sensor";
import { describe, expect, it } from "vitest";

import { buildEvidence, compactAction, type CompactAction, type Observation } from "../src/lib/evidence";
import { AGENT_AT, HUMAN, HUMAN_AT, UNKNOWN_AUTOMATION, buildQuestions, describeDriver, parseAnswers, toVerdict, type JevAnswer } from "../src/lib/jev-questions";
import { decide } from "../src/lib/passport";
import type { JevResult, RulesPassport } from "../src/lib/store";

const click = (over: Record<string, unknown> = {}) => ({
  kind: "click",
  index: 0,
  t: 10,
  trusted: true,
  synthetic: false,
  pointerType: "mouse",
  hoverMs: 3,
  pressMs: 1,
  gapMs: 400,
  approach: { moves: 0, pathPx: 0, jumpPx: 349, straightness: 1, constantSpeedRatio: 0 },
  offsetNorm: 0,
  zeroPressure: false,
  ...over,
});

describe("compactAction", () => {
  it("keeps click timing and approach geometry", () => {
    const a = compactAction(click(), [["pointer.teleport", 1.6]]);
    expect(a).toMatchObject({ k: "click", hoverMs: 3, pressMs: 1, moves: 0, jumpPx: 349, rules: ["pointer.teleport"] });
  });

  it("summarises typing gaps and holds instead of keeping every key", () => {
    const a = compactAction({ kind: "typing", index: 2, keys: 4, gaps: [100, 200, 300], holds: [80, 90, 100], charsNoKey: 0 }, []);
    expect(a).toMatchObject({ k: "typing", keys: 4, gapMedian: 200, holdMedian: 90 });
    expect(a && a.k === "typing" && a.gapSpread).toBeGreaterThan(0);
  });

  it("rejects unknown kinds and clamps hostile numbers", () => {
    expect(compactAction({ kind: "screenshot" }, [])).toBeNull();
    expect(compactAction("nope", [])).toBeNull();
    const a = compactAction(click({ hoverMs: 1e12, pressMs: "x", index: -5 }), "not-an-array");
    expect(a).toMatchObject({ hoverMs: 1_000_000, pressMs: null, i: 0, rules: [] });
  });
});

describe("buildEvidence", () => {
  const actions = [compactAction(click(), [["pointer.teleport", 1.6]]), compactAction(click({ index: 1, trusted: false }), [["pointer.teleport", 1.6]])].filter(
    (a): a is CompactAction => a !== null,
  );
  const observations: Observation[] = [{ id: "artifact.active", label: "Agent overlay present in the page", detail: "claude-agent-glow-border", decisive: true, drivers: ["claude-in-chrome"] }];

  it("describes clicks, page signals and observations without rule weights", () => {
    const e = buildEvidence({ actions, actionCount: 2, observations, pages: ["/invoices"] }, (id) => (id === "claude-in-chrome" ? "Claude in Chrome" : id));
    expect(e.clicks).toMatchObject({ share_with_no_approach_path: 1, median_press_duration_ms: 1, trusted_share: 0.5 });
    expect(e.page_signals).toEqual(["Agent overlay present in the page: claude-agent-glow-border (points to Claude in Chrome)"]);
    expect(e.observations).toEqual(["Pointer jumped straight to the target (2×)"]);
    expect(JSON.stringify(e)).not.toContain("1.6");
  });

  it("spells out input that real hardware cannot produce", () => {
    const fractional = compactAction(click({ fractional: true }), []);
    const e = buildEvidence({ actions: [fractional!], actionCount: 1, observations: [], pages: [] });
    expect(e.impossible_for_real_hardware).toEqual(["1 of 1 mouse presses landed on fractional pixel positions at 1x zoom; real mice and trackpads report whole pixels"]);
    expect(buildEvidence({ actions: [actions[0]!], actionCount: 1, observations: [], pages: [] })).not.toHaveProperty("impossible_for_real_hardware");
  });

  it("keeps zero shares, which are evidence, but drops zero counts", () => {
    const e = buildEvidence({ actions: [actions[1]!], actionCount: 1, observations: [], pages: [] });
    expect(e.clicks).toMatchObject({ trusted_share: 0 });
    expect(e.clicks).not.toHaveProperty("zero_pressure_presses");
    expect(e).not.toHaveProperty("typing");
  });
});

describe("questions", () => {
  const q = buildQuestions(DRIVERS);

  it("offers every registry agent plus a person and unknown automation, within Jev's 255 options", () => {
    const options = Object.keys((q.driver as { criteria: Record<string, string> }).criteria);
    expect(options).toContain(HUMAN);
    expect(options).toContain(UNKNOWN_AUTOMATION);
    expect(options).toContain("claude-in-chrome");
    expect(options.length).toBe(DRIVERS.length + 2);
    expect(options.length).toBeLessThanOrEqual(255);
  });

  it("describes an agent by its input mechanics", () => {
    const claude = DRIVERS.find((d) => d.id === "claude-in-chrome")!;
    const text = describeDriver(claude);
    expect(text).toContain("Claude in Chrome (Anthropic), browser extension");
    expect(text).toContain("clicks land on the exact centre of the target");
    expect(text.length).toBeLessThan(900);
  });

  it("stays well inside Jev's request limit", () => {
    // About 4 characters per token; Jev allows 64k tokens per request and the session state needs room too.
    expect(JSON.stringify(q).length / 4).toBeLessThan(30_000);
  });
});

describe("parseAnswers and toVerdict", () => {
  const raw = (noul: number, choice: string, probabilities: Record<string, number>) => ({
    model: "jev-1.13.0",
    answers: { agent: { type: "noul", noul }, driver: { type: "choice", choice, confidence: 0.8, probabilities } },
  });

  it("reads the agent probability and ranks the driver candidates", () => {
    const a = parseAnswers(raw(0.97, "playwright", { playwright: 0.7, puppeteer: 0.2, human: 0.1, comet: 0 }));
    expect(a).toEqual({
      agentProbability: 0.97,
      choice: "playwright",
      confidence: 0.8,
      candidates: [
        { id: "playwright", p: 0.7 },
        { id: "puppeteer", p: 0.2 },
        { id: "human", p: 0.1 },
      ],
    });
  });

  it("throws on a response without the answers we asked for", () => {
    expect(() => parseAnswers({ answers: { agent: { noul: 0.5 } } })).toThrow();
    expect(() => parseAnswers(null)).toThrow();
  });

  const answer = (p: number, choice: string, top = 0.7): JevAnswer => ({ agentProbability: p, choice, confidence: 0.8, candidates: [{ id: choice, p: top }] });

  it("calls an agent only above the threshold, and names it only when the choice is clear", () => {
    expect(toVerdict(answer(AGENT_AT, "playwright"))).toMatchObject({ verdict: "agent", tier: "recognised", driverId: "playwright" });
    expect(toVerdict(answer(0.95, "playwright", 0.2))).toMatchObject({ verdict: "agent", tier: "unknown-automation", driverId: null });
    expect(toVerdict(answer(0.95, UNKNOWN_AUTOMATION))).toMatchObject({ verdict: "agent", driverId: null });
    expect(toVerdict(answer(0.5, "playwright"))).toMatchObject({ verdict: "unknown" });
    expect(toVerdict(answer(HUMAN_AT, HUMAN))).toMatchObject({ verdict: "human", confidence: 1 - HUMAN_AT });
  });
});

describe("decide", () => {
  const rules: RulesPassport = { verdict: "agent", tier: "recognised", agentProbability: 0.96, driverId: "puppeteer" };
  const jev: JevResult = { agentProbability: 0.05, choice: HUMAN, confidence: 0.9, candidates: [{ id: HUMAN, p: 0.9 }], at: 0, model: "jev-1.13.0", latencyMs: 200, inputTokens: 900, actionsSeen: 6 };
  const overlay: Observation = { id: "artifact.active", label: "Agent overlay present in the page", decisive: true, drivers: ["claude-in-chrome"] };

  it("lets Jev overrule the in-browser rules", () => {
    expect(decide({ observations: new Map(), rules, jev })).toMatchObject({ verdict: "human", decidedBy: "jev" });
  });

  it("falls back to the rules until Jev answers", () => {
    expect(decide({ observations: new Map(), rules, jev: null })).toMatchObject({ verdict: "agent", driverId: "puppeteer", decidedBy: "rules" });
  });

  it("lets Jev name the agent when the exact match does not say which", () => {
    const webdriver: Observation = { id: "env.webdriver", label: "navigator.webdriver is true", decisive: true, drivers: [] };
    const named: JevResult = { ...jev, agentProbability: 0.98, choice: "playwright", candidates: [{ id: "playwright", p: 0.99 }] };
    expect(decide({ observations: new Map([["wd", webdriver]]), rules: null, jev: named })).toMatchObject({ verdict: "agent", tier: "recognised", driverId: "playwright", decidedBy: "exact-match" });
    expect(decide({ observations: new Map([["wd", webdriver]]), rules: null, jev: null })).toMatchObject({ verdict: "agent", tier: "unknown-automation", driverId: null });
  });

  it("settles exact matches without judgement, and signatures above everything", () => {
    expect(decide({ observations: new Map([["overlay", overlay]]), rules, jev })).toMatchObject({ verdict: "agent", driverId: "claude-in-chrome", decidedBy: "exact-match" });
    expect(decide({ observations: new Map([["overlay", overlay]]), rules: { ...rules, tier: "verified" }, jev })).toMatchObject({ tier: "verified", decidedBy: "signature" });
  });

  it("names the product rather than the library under it once the product's own marker is seen", () => {
    const webdriver: Observation = { id: "env.webdriver", label: "navigator.webdriver is true", decisive: true, drivers: [] };
    const aria: Observation = { id: "env.automation-global", label: "Automation framework global in the page", decisive: true, drivers: ["puppeteer"] };
    const mcp: Observation = { id: "env.stack-marker", label: "Automation framework in the call stack", decisive: true, drivers: ["chrome-devtools-mcp"] };
    const saysPuppeteer: JevResult = { ...jev, agentProbability: 0.99, choice: "puppeteer", candidates: [{ id: "puppeteer", p: 1 }] };
    const withMcp = new Map([["wd", webdriver], ["aria", aria], ["mcp", mcp]]);
    expect(decide({ observations: withMcp, rules: null, jev: saysPuppeteer })).toMatchObject({ verdict: "agent", driverId: "chrome-devtools-mcp", decidedBy: "exact-match" });
    // Plain Puppeteer shows the same globals and no product marker: it stays Puppeteer.
    expect(decide({ observations: new Map([["wd", webdriver], ["aria", aria]]), rules: null, jev: saysPuppeteer })).toMatchObject({ driverId: "puppeteer" });

    const cdc: Observation = { id: "env.automation-global", label: "Automation framework global in the page", decisive: true, drivers: ["selenium"] };
    const wdio: Observation = { id: "env.driver-wrapper", label: "Built-in API replaced by automation framework code", decisive: true, drivers: ["webdriverio"] };
    const saysSelenium: JevResult = { ...jev, agentProbability: 0.99, choice: "selenium", candidates: [{ id: "selenium", p: 0.5 }] };
    expect(decide({ observations: new Map([["wd", webdriver], ["cdc", cdc], ["wdio", wdio]]), rules: null, jev: saysSelenium })).toMatchObject({ driverId: "webdriverio" });
  });

  it("decides nothing with no evidence at all", () => {
    expect(decide({ observations: new Map(), rules: null, jev: null })).toBeNull();
  });
});
