import { analyzeAction } from "../src/detect/analyze";
import { patternArtifact } from "../src/probes/artifacts";
import { cdpBindings, devtoolsCommandLine, probeAutomation } from "../src/probes/automation";
import { ConsoleWatcher } from "../src/probes/console";
import type { ProbeResult } from "../src/probes/automation";
import { buildIndex, DRIVERS } from "../src/registry";
import { agentClick, resetIndex, scroll } from "./fixtures";

const registry = buildIndex(DRIVERS);
const ids = (rs: { id: string }[]) => rs.map((r) => r.id);
const W = window as unknown as Record<string, unknown>;

beforeEach(() => resetIndex());

describe("a plain browser", () => {
  it("trips no automation, stealth or binding probes", () => {
    const keys = probeAutomation(registry, 0).map((r) => r.key);
    expect(keys.filter((k) => /automation-global|webdriver|agent-ua|patched-api|cdp-binding|devtools-api/.test(k))).toEqual([]);
  });
});

describe("DevTools-protocol bindings", () => {
  afterEach(() => delete W.__rb_x7k2m9q4w1);

  it("finds a Runtime.addBinding function by its shape and error", () => {
    // Bindings are native, nameless and zero-arity; a callable Proxy stringifies as native too.
    W.__rb_x7k2m9q4w1 = new Proxy((() => function () {})(), {
      apply() {
        throw new TypeError("Invalid arguments: should be exactly one string.");
      },
    });
    expect(cdpBindings()).toContain("__rb_x7k2m9q4w1");
    expect(probeAutomation(registry, 0).map((r) => r.key)).toContain("env.cdp-binding");
  });

  it("ignores ordinary page functions", () => {
    W.__rb_x7k2m9q4w1 = function () {};
    expect(cdpBindings()).not.toContain("__rb_x7k2m9q4w1");
  });
});

describe("DevTools command-line API", () => {
  afterEach(() => delete W.getEventListeners);
  it("notices getEventListeners exposed on window", () => {
    W.getEventListeners = () => ({});
    expect(devtoolsCommandLine()).toBe("getEventListeners");
  });
});

describe("stealth leftovers", () => {
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).headless;
  });
  it("flags Stagehand v2's invented navigator.headless", () => {
    (navigator as unknown as Record<string, unknown>).headless = false;
    const r = probeAutomation(registry, 0).find((x) => x.key === "env.patched-api");
    expect(r?.reason.detail).toContain("navigator.headless");
  });
});

describe("framework artifacts with random ids", () => {
  it("recognises Patchright's self-removing init script", () => {
    const s = document.createElement("script");
    s.className = "a".repeat(40);
    s.id = "b".repeat(44);
    expect(patternArtifact(s)?.id).toBe("patchright");
  });

  it("recognises nodriver's click marker", () => {
    const d = document.createElement("div");
    d.id = "0123456789abcdef";
    d.setAttribute("style", "position:fixed;z-index:99999999;width:10px;height:10px;border-radius:50%;background:red;");
    expect(patternArtifact(d)?.id).toBe("nodriver");
  });

  it("leaves ordinary hashed ids alone", () => {
    const d = document.createElement("div");
    d.id = "0123456789abcdef";
    d.setAttribute("style", "z-index: 10");
    expect(patternArtifact(d)).toBeNull();
  });
});

describe("console markers", () => {
  it("names browser-use from its highlight cleanup log and restores console afterwards", () => {
    const found: ProbeResult[] = [];
    const original = console.log;
    const w = new ConsoleWatcher(registry, () => 0, (r) => found.push(r));
    w.start();
    console.log("Removing", 3, "browser-use highlight elements");
    w.stop();
    expect(found[0]?.key).toBe("artifact.console:browser-use");
    expect(found[0]?.reason.decisive).toBe(true);
    expect(console.log).toBe(original);
  });

  it("ignores ordinary logs", () => {
    const found: ProbeResult[] = [];
    const w = new ConsoleWatcher(registry, () => 0, (r) => found.push(r));
    w.start();
    console.log("user clicked export", { rows: 10 });
    w.stop();
    expect(found).toHaveLength(0);
  });
});

describe("input that no device produces", () => {
  it("flags fractional mouse coordinates at 1× zoom", () => {
    expect(ids(analyzeAction(agentClick({ fractional: true }), [], DRIVERS))).toContain("pointer.fractional");
  });

  it("flags absurd wheel deltas", () => {
    expect(ids(analyzeAction(scroll({ wheels: 1, deltas: [9999999] }), [], DRIVERS))).toContain("scroll.absurd-wheel");
    expect(ids(analyzeAction(scroll({ wheels: 1, deltas: [0.00001] }), [], DRIVERS))).toContain("scroll.absurd-wheel");
    expect(ids(analyzeAction(scroll({ wheels: 3, deltas: [100, 120, 90] }), [], DRIVERS))).not.toContain("scroll.absurd-wheel");
  });
});
