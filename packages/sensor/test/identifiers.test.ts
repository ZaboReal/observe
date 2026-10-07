import { analyzeAction } from "../src/detect/analyze";
import { ArtifactWatcher } from "../src/probes/artifacts";
import { greaseBrand, probeAutomation, uaMismatch, type ProbeResult } from "../src/probes/automation";
import { buildIndex, DRIVERS } from "../src/registry";
import { agentClick, resetIndex, typing } from "./fixtures";

const registry = buildIndex(DRIVERS);
const ids = (rs: { id: string }[]) => rs.map((r) => r.id);
const hints = (rs: { id: string; drivers?: Record<string, number> }[]) => rs.find((r) => r.id === "driver.mechanics")?.drivers ?? {};
const tick = () => new Promise((r) => setTimeout(r, 0));
const CHROME_153_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

beforeEach(() => resetIndex());

describe("Chromium client-hint consistency", () => {
  it("reproduces Chromium's GREASE brands", () => {
    expect(greaseBrand(152)).toEqual({ brand: "Not?A_Brand", version: "24" });
    expect(greaseBrand(153)).toEqual({ brand: "Not_A Brand", version: "8" });
    expect(greaseBrand(154)).toEqual({ brand: "Not A(Brand", version: "99" });
  });

  it("accepts a genuine Chrome 153 brand list", () => {
    const brands = [
      { brand: "Google Chrome", version: "153" },
      { brand: "Not_A Brand", version: "8" },
      { brand: "Chromium", version: "153" },
    ];
    expect(uaMismatch(CHROME_153_UA, brands)).toBeNull();
  });

  it("accepts a two-brand Chromium build", () => {
    expect(uaMismatch(CHROME_153_UA.replace("153", "152"), [
      { brand: "Not?A_Brand", version: "24" },
      { brand: "Chromium", version: "152" },
    ])).toBeNull();
  });

  it("catches a shuffled or invented brand list", () => {
    const wrongOrder = [
      { brand: "Chromium", version: "153" },
      { brand: "Google Chrome", version: "153" },
      { brand: "Not_A Brand", version: "8" },
    ];
    expect(uaMismatch(CHROME_153_UA, wrongOrder)).toMatch(/order/);
    expect(uaMismatch(CHROME_153_UA, [{ brand: "Chromium", version: "153" }, { brand: "Not A;Brand", version: "99" }])).toMatch(/GREASE/);
  });

  it("catches a UA that disagrees with the client hints", () => {
    const brands = [
      { brand: "Google Chrome", version: "153" },
      { brand: "Not_A Brand", version: "8" },
      { brand: "Chromium", version: "153" },
    ];
    expect(uaMismatch(CHROME_153_UA.replace("Chrome/153", "Chrome/122"), brands)).toMatch(/Chrome\/122/);
    expect(uaMismatch(`${CHROME_153_UA} Edg/153.0.0.0`, brands)).toMatch(/Edge/);
  });

  it("catches a Chromium UA with no client hints (e.g. Fara-7B on Firefox claiming Edge)", () => {
    expect(uaMismatch(`${CHROME_153_UA} Edg/122.0.0.0`, null)).toMatch(/without userAgentData/);
    expect(uaMismatch("Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0", null)).toBeNull();
  });
});

describe("declared agent user agents", () => {
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).userAgent;
  });

  it("treats Nova Act's UA token as decisive", () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => `${CHROME_153_UA} Agent-NovaAct/0.9` });
    const r = probeAutomation(registry, 0).find((x) => x.key === "env.agent-ua:nova-act");
    expect(r?.reason.decisive).toBe(true);
  });

  it("treats Google-Agent's UA as decisive", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () => "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko; compatible; Google-Agent; +https://developers.google.com/crawling/docs/crawlers-fetchers/google-agent) Chrome/153.0.0.0 Safari/537.36",
    });
    expect(probeAutomation(registry, 0).map((x) => x.key)).toContain("env.agent-ua:google-agent");
  });
});

describe("framework globals", () => {
  afterEach(() => {
    for (const k of ["get_clickable_elements", "get_highlight_element", "MultimodalWebSurfer"]) delete (window as unknown as Record<string, unknown>)[k];
  });

  it("needs two Eko globals before naming Eko", () => {
    (window as unknown as Record<string, unknown>).get_clickable_elements = () => [];
    expect(probeAutomation(registry, 0).map((x) => x.key)).not.toContain("env.automation-global:eko");
    (window as unknown as Record<string, unknown>).get_highlight_element = () => null;
    expect(probeAutomation(registry, 0).map((x) => x.key)).toContain("env.automation-global:eko");
  });

  it("names Microsoft Fara from its web-surfer global", () => {
    (window as unknown as Record<string, unknown>).MultimodalWebSurfer = {};
    expect(probeAutomation(registry, 0).map((x) => x.key)).toContain("env.automation-global:fara");
  });
});

describe("page artifacts for more agents", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function watch() {
    const found: ProbeResult[] = [];
    const w = new ArtifactWatcher(registry, () => 0, { onFound: (r) => found.push(r), onGone: () => {} });
    w.start();
    return { w, found };
  }

  it("names Comet from its agent overlay and its extension frame", async () => {
    const { w, found } = watch();
    document.body.innerHTML = `<div id="pplx-agent-overlay"></div><iframe src="chrome-extension://npclhjbddhklpbnacpjloidibaggcgon/overlay.html?params=%7B%7D"></iframe>`;
    await tick();
    const keys = found.map((f) => f.key);
    expect(keys).toContain("artifact.active:comet");
    expect(keys).toContain("artifact.extension:comet");
    w.stop();
  });

  it("names Eko from its highlight overlay and Nova Act from its attribute", async () => {
    const { w, found } = watch();
    document.body.innerHTML = `<div id="eko-highlight-container"></div><button nova-act-id="7">Go</button>`;
    await tick();
    const keys = found.map((f) => f.key);
    expect(keys).toContain("artifact.active:eko");
    expect(keys).toContain("artifact.active:nova-act");
    w.stop();
  });
});

describe("more extension markers", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    for (const k of ["__hrp_globals", "__codexAgentPopupInterceptor"]) delete (window as unknown as Record<string, unknown>)[k];
  });

  function watch() {
    const found: ProbeResult[] = [];
    const w = new ArtifactWatcher(registry, () => 0, { onFound: (r) => found.push(r), onGone: () => {} });
    w.start();
    return { w, found };
  }

  it("names Comet from a versioned overlay id prefix", async () => {
    const { w, found } = watch();
    document.body.innerHTML = `<div id="pplx-agent-0_0-overlay-base"></div>`;
    await tick();
    expect(found.map((f) => f.key)).toContain("artifact.active:comet");
    w.stop();
  });

  it("names the ChatGPT extension from its overlay root and Claude from its stop button id", async () => {
    const { w, found } = watch();
    document.body.innerHTML = `<div id="codex-agent-overlay-root"></div><div id="claude-agent-stop-button"></div>`;
    await tick();
    const keys = found.map((f) => f.key);
    expect(keys).toContain("artifact.active:chatgpt-extension");
    expect(keys).toContain("artifact.active:claude-in-chrome");
    w.stop();
  });

  it("treats installed-only markers as naming hints, not agent evidence", async () => {
    const { w, found } = watch();
    document.body.setAttribute("monica-id", "ofpnmcalabcbjgholdjcjblkibolbppb");
    document.body.innerHTML = `<__hrp__></__hrp__>`;
    await tick();
    const installed = found.filter((f) => f.key.startsWith("env.installed:"));
    expect(installed.map((f) => f.key)).toEqual(expect.arrayContaining(["env.installed:monica", "env.installed:harpa"]));
    expect(installed.every((f) => f.reason.weight === 0)).toBe(true);
    document.body.removeAttribute("monica-id");
    w.stop();
  });

  it("reports HARPA's always-on globals as installed, ChatGPT's leased-tab global as automation", () => {
    (window as unknown as Record<string, unknown>).__hrp_globals = {};
    (window as unknown as Record<string, unknown>).__codexAgentPopupInterceptor = {};
    const keys = probeAutomation(registry, 0).map((r) => r.key);
    expect(keys).toContain("env.installed:harpa");
    expect(keys).not.toContain("env.automation-global:harpa");
    expect(keys).toContain("env.automation-global:chatgpt-extension");
  });

  it("catches a stealth-patched webdriver and permissions.query", () => {
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => undefined });
    const keys = probeAutomation(registry, 0).map((r) => r.key);
    expect(keys).toContain("env.patched-api");
    delete (navigator as unknown as Record<string, unknown>).webdriver;
  });
});

describe("agent announcements over postMessage", () => {
  it("names the ChatGPT extension from its WXT start-up message", async () => {
    const { MessageWatcher } = await import("../src/probes/messages");
    const found: ProbeResult[] = [];
    const exts: string[] = [];
    const m = new MessageWatcher(registry, () => 0, (r) => found.push(r), (id) => exts.push(id));
    m.start();
    window.dispatchEvent(new MessageEvent("message", { data: { type: "hehggadaopoacecdllhhajmbjkdcmajg:codex:wxt:content-script-started", messageId: "x" } }));
    expect(found.map((f) => f.key)).toContain("artifact.message:chatgpt-extension");
    expect(exts).toContain("hehggadaopoacecdllhhajmbjkdcmajg");
    m.stop();
  });

  it("ignores ordinary app messages", async () => {
    const { MessageWatcher } = await import("../src/probes/messages");
    const found: ProbeResult[] = [];
    const m = new MessageWatcher(registry, () => 0, (r) => found.push(r), () => {});
    m.start();
    window.dispatchEvent(new MessageEvent("message", { data: { type: "analytics:pageview" } }));
    expect(found).toHaveLength(0);
    m.stop();
  });
});

describe("Chromium actor mechanics (Gemini in Chrome, Brave Leo)", () => {
  it("recognises the 5 ms move-press-release click", () => {
    const h = hints(analyzeAction(agentClick({ hoverMs: 5.2, pressMs: 5.1 }), [], DRIVERS));
    expect(h["gemini-in-chrome"]).toBeGreaterThan(0);
    expect(h["brave-leo"]).toBeGreaterThan(0);
    expect(h["claude-in-chrome"] ?? 0).toBe(0);
  });

  it("recognises the even 50 ms typing cadence", () => {
    const rs = analyzeAction(typing({ keys: 9, gaps: [50, 50.2, 49.8, 50.1, 50, 49.9, 50.3, 50], holds: [25, 25, 25, 25, 25, 25] }), [], DRIVERS);
    expect(ids(rs)).toContain("typing.machine-gaps");
    expect(hints(rs)["gemini-in-chrome"]).toBeGreaterThan(0);
  });

  it("flags pointer events with no screen position and positionless clicks", () => {
    const rs = analyzeAction(agentClick({ noScreenPosition: true, positionless: true }), [], DRIVERS);
    expect(ids(rs)).toEqual(expect.arrayContaining(["pointer.no-screen-position", "click.positionless"]));
  });

  it("flags capitals with no Shift press and pastes with no shortcut or menu", () => {
    expect(ids(analyzeAction(typing({ keys: 5, phantomShift: 2 }), [], DRIVERS))).toContain("typing.phantom-shift");
    expect(ids(analyzeAction(typing({ pastes: 1, pasteEvents: 1 }), [], DRIVERS))).toContain("typing.paste-no-event");
    expect(ids(analyzeAction(typing({ pastes: 1, pasteEvents: 1, pasteMenus: 1 }), [], DRIVERS))).not.toContain("typing.paste-no-event");
  });
});
