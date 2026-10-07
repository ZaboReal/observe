import type { ApproachStats } from "../src/capture/records";
import type { ClickRecord, TypingRecord, ScrollRecord } from "../src/capture";

let index = 0;
export const resetIndex = () => (index = 0);

const approach = (o: Partial<ApproachStats> = {}): ApproachStats => ({
  moves: 0,
  coalesced: 0,
  pathPx: 0,
  directPx: 0,
  straightness: 1,
  maxStepPx: 0,
  jumpPx: null,
  zeroMovement: 0,
  intervalStd: NaN,
  constantSpeedRatio: 0,
  ...o,
});

const target = { ordinal: 1, tag: "button", editable: false, sensitive: false, rect: { x: 100, y: 100, w: 120, h: 32 } };

/** A click the way Claude in Chrome makes one: one move, 100 ms, then press + release at the centre. */
export function agentClick(o: Partial<ClickRecord> = {}): ClickRecord {
  return {
    kind: "click",
    index: index++,
    t: 1000 * index,
    trusted: true,
    synthetic: false,
    pointerType: "mouse",
    target,
    x: 160,
    y: 116,
    offsetPx: 0,
    offsetNorm: 0,
    approach: approach({ moves: 1, coalesced: 1, maxStepPx: 349, pathPx: 349, directPx: 349 }),
    hoverMs: 100,
    pressMs: 0.4,
    gapMs: 3200,
    idleMoves: 0,
    noScreenPosition: false,
    fractional: false,
    positionless: false,
    zeroPressure: false,
    hidden: false,
    focused: true,
    ...o,
  };
}

/** A person's click: a curved, sampled approach, a short hover, an off-centre press of ~100 ms. */
export function humanClick(o: Partial<ClickRecord> = {}): ClickRecord {
  return {
    ...agentClick(),
    index: index++,
    t: 1000 * index,
    x: 171,
    y: 121,
    offsetPx: 12,
    offsetNorm: 0.19,
    approach: approach({ moves: 38, coalesced: 96, pathPx: 420, directPx: 351, straightness: 0.84, maxStepPx: 31, constantSpeedRatio: 0.18, intervalStd: 4 }),
    hoverMs: 310,
    pressMs: 104,
    gapMs: 2100,
    idleMoves: 40,
    ...o,
  };
}

export function typing(o: Partial<TypingRecord> = {}): TypingRecord {
  return {
    kind: "typing",
    index: index++,
    t: 1000 * index,
    end: 1000 * index + 900,
    target: { ordinal: 2, tag: "input", inputType: "text", editable: true, sensitive: false },
    keys: 0,
    gaps: [],
    holds: [],
    rollovers: 0,
    corrections: 0,
    insertNoKey: 0,
    charsNoKey: 0,
    insertSingles: 0,
    pastes: 0,
    pasteEvents: 0,
    pasteShortcuts: 0,
    pasteMenus: 0,
    phantomShift: 0,
    syntheticPastes: 0,
    blankKeys: 0,
    changeBeforeInput: 0,
    untrustedInputs: 0,
    silentValueSets: 0,
    gapMs: 2500,
    idleMoves: 0,
    hidden: false,
    focused: true,
    ...o,
  };
}

export function scroll(o: Partial<ScrollRecord> = {}): ScrollRecord {
  return {
    kind: "scroll",
    index: index++,
    t: 1000 * index,
    end: 1000 * index + 300,
    wheels: 0,
    deltas: [],
    programmatic: 0,
    scrolls: 1,
    gapMs: 2000,
    idleMoves: 0,
    hidden: false,
    focused: true,
    ...o,
  };
}
