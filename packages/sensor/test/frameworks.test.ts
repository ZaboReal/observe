import { analyzeAction } from "../src/detect/analyze";
import { makeReason } from "../src/detect/rules";
import { Scorer } from "../src/detect/scorer";
import { ArtifactWatcher, patternArtifact } from "../src/probes/artifacts";
import { cdpBindings, devtoolsCommandLine, probeAutomation } from "../src/probes/automation";
import { ConsoleWatcher } from "../src/probes/console";
import { StackWatcher } from "../src/probes/stack";
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
    expect(keys.filter((k) => /automation-global|driver-wrapper|webdriver|agent-ua|patched-api|cdp-binding|devtools-api/.test(k))).toEqual([]);
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

// Seen in tools/check runs against the probe page (2026-10-08): WebdriverIO 10.0.0, Chrome DevTools MCP 1.10.1 and
// agent-browser 0.38.2 on Chrome 154. Each showed its library's markers too, which is why they were named after it.
describe("WebdriverIO", () => {
  const original = Element.prototype.attachShadow;
  afterEach(() => {
    Element.prototype.attachShadow = original;
    delete W.__name;
  });

  it("is named from the [WDIO] wrapper its BiDi preload script puts around attachShadow", () => {
    // As webdriverio/build/scripts/customElement.js installs it.
    Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
      const shadowRoot = original.call(this, init);
      console.debug("[WDIO]", "newShadowRoot", this);
      return shadowRoot;
    };
    const r = probeAutomation(registry, 0).find((x) => x.key === "env.driver-wrapper:webdriverio");
    expect(r?.reason.decisive).toBe(true);
    expect(r?.reason.detail).toBe("Element.prototype.attachShadow ([WDIO])");
  });

  it("leaves a page's own attachShadow wrapper unnamed", () => {
    Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
      return original.call(this, init);
    };
    const keys = probeAutomation(registry, 0).map((r) => r.key);
    expect(keys.filter((k) => k.startsWith("env.driver-wrapper"))).toEqual([]);
    expect(keys).toContain("env.modified-api");
  });

  it("treats its global __name helper as a naming hint only", () => {
    W.__name = function (target: object, _value: string) {
      return Object.defineProperty(target, "name", { value: _value, configurable: true });
    };
    const rs = probeAutomation(registry, 0);
    const hint = rs.find((r) => r.key === "env.installed:webdriverio");
    expect(hint?.reason.weight).toBe(0);
    expect(hint?.reason.decisive).toBeUndefined();
    expect(rs.map((r) => r.key)).not.toContain("env.automation-global:webdriverio");
  });

  it("outranks ChromeDriver's cdc_ globals, which it shows too", () => {
    const s = new Scorer(registry);
    s.addPersistent("env.automation-global:selenium", makeReason("env.automation-global", 10, { drivers: { selenium: 6 } }));
    s.addPersistent("env.agent-ua:headless-chrome", makeReason("env.agent-ua", 10, { drivers: { "headless-chrome": 6 } }));
    s.addPersistent("env.driver-wrapper:webdriverio", makeReason("env.driver-wrapper", 10, { drivers: { webdriverio: 6 } }));
    expect(s.compute(1000).driver?.id).toBe("webdriverio");
  });
});

describe("Chrome DevTools MCP", () => {
  // Puppeteer appends `//# sourceURL=pptr:<method>;<caller's location, URL-encoded>` to everything it evaluates.
  const evaluated = (sourceUrl: string) =>
    new Function("observer", "target", `observer.observe(target, { childList: true });\n//# sourceURL=${sourceUrl}`) as (o: MutationObserver, t: Node) => void;
  const MCP_WAIT = "pptr:evaluateHandle;WaitForHelper.waitForStableDom%20(file%3A%2F%2F%2FUsers%2Fme%2F.npm%2F_npx%2F1a2b%2Fnode_modules%2Fchrome-devtools-mcp%2Fbuild%2Fsrc%2Futils%2FWaitForHelper.js%3A90%3A28)";

  function watch() {
    const found: ProbeResult[] = [];
    const w = new StackWatcher(registry, () => 0, (r) => found.push(r));
    w.start();
    return { w, found, observer: new MutationObserver(() => {}) };
  }

  it("is read from the observe() call in the DOM-settle wait it runs after every action, over Puppeteer", () => {
    const original = MutationObserver.prototype.observe;
    const { w, found, observer } = watch();
    evaluated(MCP_WAIT)(observer, document.body);
    observer.disconnect();
    w.stop();
    expect(found.map((f) => f.key)).toEqual(["env.stack-marker:chrome-devtools-mcp"]);
    expect(found[0]?.reason.decisive).toBe(true);
    expect(MutationObserver.prototype.observe).toBe(original);
  });

  it("keeps a plain Puppeteer evaluation as Puppeteer, and the page's own observers as nothing", () => {
    const { w, found, observer } = watch();
    observer.observe(document.body, { childList: true });
    evaluated("pptr:evaluate;Object.run%20(file%3A%2F%2F%2Fsrv%2Fscrape.mjs%3A12%3A3)")(observer, document.body);
    observer.disconnect();
    w.stop();
    expect(found.map((f) => f.key)).toEqual(["env.stack-marker:puppeteer"]);
  });

  it("collects Puppeteer's globals once its own marker is seen, not from the click mechanics they share", () => {
    const s = new Scorer(registry);
    // Puppeteer's clicks: one move, then press and release within a millisecond. Both registry entries match them.
    for (const c of [agentClick({ hoverMs: 0.5, pressMs: 0.4 }), agentClick({ hoverMs: 0.5, pressMs: 0.4 })]) {
      const reasons = analyzeAction(c, [], DRIVERS);
      expect(reasons.find((r) => r.id === "driver.mechanics")?.drivers).toHaveProperty("chrome-devtools-mcp");
      s.addAction(c.index, reasons, c.t);
    }
    s.addPersistent("env.automation-global:puppeteer", makeReason("env.automation-global", 10, { drivers: { puppeteer: 6 } }));
    s.addPersistent("env.agent-ua:headless-chrome", makeReason("env.agent-ua", 10, { drivers: { "headless-chrome": 6 } }));
    expect(s.compute(1000).driver?.id).not.toBe("chrome-devtools-mcp");
    s.addPersistent("env.stack-marker:chrome-devtools-mcp", makeReason("env.stack-marker", 20, { drivers: { "chrome-devtools-mcp": 6 } }));
    const p = s.compute(1000);
    expect(p.driver?.id).toBe("chrome-devtools-mcp");
    expect(p.candidates.map((c) => c.id)).not.toContain("puppeteer");
  });
});

describe("Vercel agent-browser", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    delete W.ModelContext;
  });

  it("is named from data-agent-browser-located, which its find locators set for a few ms", async () => {
    document.body.innerHTML = `<label for="email">Invite a teammate</label><input id="email">`;
    const found: ProbeResult[] = [];
    const gone: string[] = [];
    const w = new ArtifactWatcher(registry, () => 0, { onFound: (r) => found.push(r), onGone: (k) => gone.push(k) });
    w.start();
    const input = document.getElementById("email")!;
    input.setAttribute("data-agent-browser-located", "true");
    await new Promise((r) => setTimeout(r, 0));
    input.removeAttribute("data-agent-browser-located");
    await new Promise((r) => setTimeout(r, 0));
    w.stop();
    expect(found.map((f) => f.key)).toEqual(["artifact.active:agent-browser"]);
    expect(gone).toEqual(["artifact.active:agent-browser"]);
  });

  it("treats the WebMCP testing interface it launches Chrome with as a naming hint", () => {
    W.ModelContext = function ModelContext() {};
    const hint = probeAutomation(registry, 0).find((r) => r.key === "env.installed:agent-browser");
    expect(hint?.reason.weight).toBe(0);
    expect(hint?.reason.detail).toBe("ModelContext");
  });
});
