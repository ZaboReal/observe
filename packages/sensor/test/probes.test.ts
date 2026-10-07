import { ArtifactWatcher } from "../src/probes/artifacts";
import { probeAutomation, type ProbeResult } from "../src/probes/automation";
import { buildIndex, DRIVERS } from "../src/registry";

const registry = buildIndex(DRIVERS);
const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((s) => s.remove());
});

describe("ArtifactWatcher", () => {
  function watch() {
    const found: ProbeResult[] = [];
    const gone: string[] = [];
    const unknown: string[] = [];
    const w = new ArtifactWatcher(registry, () => 0, {
      onFound: (r) => found.push(r),
      onGone: (k) => gone.push(k),
      onUnknownExtension: (id) => unknown.push(id),
    });
    w.start();
    return { w, found, gone, unknown };
  }

  it("finds Claude in Chrome's overlay and notices when it leaves", async () => {
    const { w, found, gone } = watch();
    const overlay = document.createElement("div");
    overlay.id = "claude-agent-stop-container";
    document.body.appendChild(overlay);
    await tick();
    expect(found.map((f) => f.key)).toContain("artifact.active:claude-in-chrome");
    expect(found[0]?.reason.drivers).toEqual({ "claude-in-chrome": 6 });
    overlay.remove();
    await tick();
    expect(gone).toContain("artifact.active:claude-in-chrome");
    w.stop();
  });

  it("finds an overlay by class inside an added subtree", async () => {
    const { w, found } = watch();
    const wrap = document.createElement("section");
    wrap.innerHTML = `<div><span class="x claude-agent-glow-border"></span></div>`;
    document.body.appendChild(wrap);
    await tick();
    expect(found.map((f) => f.key)).toContain("artifact.active:claude-in-chrome");
    w.stop();
  });

  it("treats the leftover animation style as residue", async () => {
    const { w, found } = watch();
    const style = document.createElement("style");
    style.id = "claude-agent-animation-styles";
    document.head.appendChild(style);
    await tick();
    expect(found.map((f) => f.key)).toContain("artifact.residue:claude-in-chrome");
    w.stop();
  });

  it("matches a known extension id from an injected asset URL and reports unknown ones", async () => {
    const { w, found, unknown } = watch();
    const img = document.createElement("img");
    img.src = "chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/icon.png";
    const other = document.createElement("img");
    other.src = "chrome-extension://aaaabbbbccccddddeeeeffffgggghhhh/x.png";
    document.body.append(img, other);
    await tick();
    expect(found.map((f) => f.key)).toContain("artifact.extension:claude-in-chrome");
    expect(unknown).toContain("aaaabbbbccccddddeeeeffffgggghhhh");
    w.stop();
  });

  it("finds artifacts already in the page when it starts", () => {
    document.body.innerHTML = `<div id="claude-phantom-cursor"></div>`;
    const { w, found } = watch();
    expect(found.map((f) => f.key)).toContain("artifact.active:claude-in-chrome");
    w.stop();
  });

  it("ignores the sensor's own UI", async () => {
    const { w, found } = watch();
    const host = document.createElement("div");
    host.setAttribute("data-observe-ignore", "");
    host.innerHTML = `<div id="claude-agent-stop-container"></div>`;
    document.body.appendChild(host);
    await tick();
    expect(found).toHaveLength(0);
    w.stop();
  });
});

describe("probeAutomation", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__playwright__binding__;
    delete (window as unknown as Record<string, unknown>).Cypress;
  });

  it("finds framework globals and names the framework", () => {
    (window as unknown as Record<string, unknown>).__playwright__binding__ = () => {};
    const rs = probeAutomation(registry, 0);
    const pw = rs.find((r) => r.key === "env.automation-global:playwright");
    expect(pw?.reason.decisive).toBe(true);
    expect(pw?.reason.drivers).toEqual({ playwright: 6 });
  });

  it("finds navigator.webdriver", () => {
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => true });
    expect(probeAutomation(registry, 0).map((r) => r.key)).toContain("env.webdriver");
    delete (navigator as unknown as Record<string, unknown>).webdriver;
  });

  it("reports nothing for a plain browser", () => {
    const keys = probeAutomation(registry, 0).map((r) => r.key);
    expect(keys.filter((k) => k.startsWith("env.automation-global") || k === "env.webdriver")).toEqual([]);
  });
});
