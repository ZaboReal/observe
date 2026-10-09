import { analyzeAction } from "../src/detect/analyze";
import { DRIVERS } from "../src/registry";
import { agentClick, humanClick, resetIndex, scroll, typing } from "./fixtures";

const ids = (rs: { id: string }[]) => rs.map((r) => r.id);
const hints = (rs: { id: string; drivers?: Record<string, number> }[]) => rs.find((r) => r.id === "driver.mechanics")?.drivers ?? {};

beforeEach(() => resetIndex());

describe("clicks", () => {
  it("flags a teleporting, centred, zero-duration click", () => {
    const rs = analyzeAction(agentClick(), [], DRIVERS);
    expect(ids(rs)).toEqual(expect.arrayContaining(["pointer.teleport", "click.centre", "click.short-press"]));
    expect(rs.find((r) => r.id === "pointer.teleport")?.weight).toBeGreaterThan(0);
  });

  it("names Claude in Chrome from its 100 ms hover and instant release", () => {
    const h = hints(analyzeAction(agentClick({ hoverMs: 101, pressMs: 0.5 }), [], DRIVERS));
    expect(Object.keys(h)).toContain("claude-in-chrome");
    expect(h["claude-in-chrome"]).toBeGreaterThan(h["browser-use"] ?? 0);
  });

  it("names browser-use from its 50 ms hover and 80 ms press", () => {
    const h = hints(analyzeAction(agentClick({ hoverMs: 52, pressMs: 81 }), [], DRIVERS));
    expect(h["browser-use"]).toBeGreaterThan(0);
    expect(h["claude-in-chrome"] ?? 0).toBe(0);
  });

  it("treats a trackpad tap after a real approach as a person, not a short press", () => {
    const tap = humanClick({ pressMs: 4 });
    expect(ids(analyzeAction(tap, [], DRIVERS))).not.toContain("click.short-press");
    // The same 4 ms release after a jump straight to the target is still flagged.
    expect(ids(analyzeAction(agentClick({ pressMs: 4 }), [], DRIVERS))).toContain("click.short-press");
  });

  it("scores a person's click toward human", () => {
    const rs = analyzeAction(humanClick(), [], DRIVERS);
    expect(ids(rs)).toEqual(expect.arrayContaining(["pointer.human-path", "click.human-press", "click.off-centre"]));
    expect(ids(rs)).not.toContain("pointer.teleport");
    expect(rs.reduce((s, r) => s + r.weight, 0)).toBeLessThan(0);
  });

  it("does not treat touch taps as teleports", () => {
    const rs = analyzeAction(agentClick({ pointerType: "touch", hoverMs: null }), [], DRIVERS);
    expect(ids(rs)).not.toContain("pointer.teleport");
    expect(ids(rs)).not.toContain("click.no-hover");
  });

  it("flags script-dispatched clicks", () => {
    const rs = analyzeAction(agentClick({ synthetic: true, trusted: false, pressMs: null }), [], DRIVERS);
    expect(ids(rs)).toEqual(["click.untrusted"]);
  });

  it("flags input while the tab is hidden", () => {
    expect(ids(analyzeAction(agentClick({ hidden: true }), [], DRIVERS))).toContain("click.hidden");
  });

  it("spots identical press timing across clicks", () => {
    const history = [agentClick({ pressMs: 80 }), agentClick({ pressMs: 80.4 }), agentClick({ pressMs: 79.8 })];
    const rs = analyzeAction(agentClick({ pressMs: 80.1 }), history, DRIVERS);
    expect(ids(rs)).toContain("click.fixed-timing");
  });
});

describe("typing", () => {
  it("flags text inserted one character at a time with no keys", () => {
    const rs = analyzeAction(typing({ insertNoKey: 9, charsNoKey: 9, insertSingles: 9 }), [], DRIVERS);
    expect(ids(rs)).toEqual(expect.arrayContaining(["typing.insert-no-keys", "typing.insert-per-char"]));
  });

  it("names Claude in Chrome from zero-gap keys and Shift-less capitals", () => {
    const rs = analyzeAction(
      typing({ keys: 9, gaps: [0.3, 0.2, 0.4, 0.3, 0.2, 0.3, 0.4, 0.2], holds: [0.2, 0.3, 0.2, 0.2, 0.3], phantomShift: 1 }),
      [],
      DRIVERS,
    );
    expect(ids(rs)).toEqual(expect.arrayContaining(["typing.fast-gaps", "typing.no-holds", "typing.phantom-shift"]));
    expect(hints(rs)["claude-in-chrome"]).toBeGreaterThan(hints(rs)["gemini-in-chrome"] ?? 0);
  });

  it("flags ChatGPT's synthetic paste, blank CDP keys and change-before-input fills", () => {
    const paste = analyzeAction(typing({ syntheticPastes: 1, untrustedInputs: 1 }), [], DRIVERS);
    expect(ids(paste)).toContain("typing.synthetic-paste");
    expect(hints(paste)["chatgpt-extension"]).toBeGreaterThan(0);
    expect(ids(analyzeAction(typing({ keys: 5, blankKeys: 5 }), [], DRIVERS))).toContain("typing.blank-keys");
    expect(ids(analyzeAction(typing({ untrustedInputs: 2, changeBeforeInput: 1 }), [], DRIVERS))).toContain("form.change-before-input");
  });

  it("still flags an insert followed by a single Enter", () => {
    expect(ids(analyzeAction(typing({ keys: 1, insertNoKey: 1, charsNoKey: 15 }), [], DRIVERS))).toContain("typing.insert-no-keys");
  });

  it("flags mouse presses with zero pressure", () => {
    expect(ids(analyzeAction(agentClick({ zeroPressure: true }), [], DRIVERS))).toContain("click.zero-pressure");
  });

  it("flags a bulk insert (Playwright fill) without naming Claude", () => {
    const rs = analyzeAction(typing({ insertNoKey: 1, charsNoKey: 9, insertSingles: 0 }), [], DRIVERS);
    expect(ids(rs)).toContain("typing.insert-no-keys");
    expect(hints(rs)["claude-in-chrome"] ?? 0).toBe(0);
    expect(hints(rs)["playwright"]).toBeGreaterThan(0);
  });

  it("flags xdotool's fixed 12 ms comb and names computer use", () => {
    const rs = analyzeAction(typing({ keys: 9, gaps: [12, 12, 12, 12, 12, 12, 12, 12], holds: [1, 1, 1, 1, 1, 1, 1, 1, 1] }), [], DRIVERS);
    expect(ids(rs)).toContain("typing.fast-gaps");
    expect(hints(rs)["computer-use"]).toBeGreaterThan(0);
  });

  it("names browser-use from ~5 ms key gaps", () => {
    const rs = analyzeAction(typing({ keys: 9, gaps: [5, 5.2, 4.9, 5.1, 5, 5.3, 4.8, 5], holds: [1, 1, 1, 1, 1, 1] }), [], DRIVERS);
    expect(hints(rs)["browser-use"]).toBeGreaterThan(0);
  });

  it("scores natural typing with rollover toward human", () => {
    const rs = analyzeAction(
      typing({ keys: 9, gaps: [210, 95, 320, 140, 260, 110, 400, 180], holds: [90, 70, 110, 80, 100, 90, 70, 120, 80], rollovers: 2 }),
      [],
      DRIVERS,
    );
    expect(ids(rs)).toEqual(expect.arrayContaining(["typing.human-rhythm", "typing.rollover"]));
    expect(rs.reduce((s, r) => s + r.weight, 0)).toBeLessThan(0);
  });

  it("flags script fills and pastes with no clipboard event", () => {
    expect(ids(analyzeAction(typing({ untrustedInputs: 2 }), [], DRIVERS))).toContain("typing.untrusted");
    expect(ids(analyzeAction(typing({ pastes: 1 }), [], DRIVERS))).toContain("typing.paste-no-event");
    expect(ids(analyzeAction(typing({ pastes: 1, pasteEvents: 1, pasteShortcuts: 1 }), [], DRIVERS))).not.toContain("typing.paste-no-event");
  });
});

describe("scroll and cadence", () => {
  it("flags scrolls with no wheel and hints the Chromium actor", () => {
    const rs = analyzeAction(scroll({ programmatic: 2 }), [], DRIVERS);
    expect(ids(rs)).toContain("scroll.programmatic");
    expect(hints(rs)["gemini-in-chrome"]).toBeGreaterThan(0);
  });

  it("recognises trackpad scrolling as human", () => {
    const rs = analyzeAction(scroll({ wheels: 8, deltas: [2, 5, 9, 14, 11, 6, 3, 1] }), [], DRIVERS);
    expect(ids(rs)).toContain("scroll.trackpad");
  });

  it("flags perfect stillness between paused actions", () => {
    const history = [agentClick(), agentClick(), agentClick()];
    expect(ids(analyzeAction(agentClick(), history, DRIVERS))).toContain("cadence.still");
  });

  it("flags actions on different controls faster than a person can move", () => {
    const first = agentClick();
    const next = typing({ gapMs: 6 });
    expect(ids(analyzeAction(next, [first], DRIVERS))).toContain("cadence.superhuman");
    expect(ids(analyzeAction(typing({ gapMs: 240 }), [first], DRIVERS))).not.toContain("cadence.superhuman");
  });

  it("does not count an action right after momentum scrolling as superhuman", () => {
    expect(ids(analyzeAction(humanClick({ gapMs: 12 }), [scroll()], DRIVERS))).not.toContain("cadence.superhuman");
  });

  it("recognises constant micro-motion between actions", () => {
    const history = [humanClick(), humanClick(), humanClick()];
    expect(ids(analyzeAction(humanClick(), history, DRIVERS))).toContain("cadence.micro-motion");
  });
});
