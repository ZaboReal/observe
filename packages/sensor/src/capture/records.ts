import type { TargetInfo } from "../util/target";

/** Per-action records. They hold geometry, timing and counts only: no text, values or element identifiers. */

export interface PageFlags {
  hidden: boolean;
  focused: boolean;
}

export interface ApproachStats {
  /** Pointer move events in the approach window before the press. */
  moves: number;
  /** Coalesced samples across those moves. */
  coalesced: number;
  /** Path length travelled in the window, px. */
  pathPx: number;
  /** Straight-line distance from the window start (or last known position) to the press, px. */
  directPx: number;
  /** directPx / pathPx. 1 = perfectly straight. */
  straightness: number;
  /** Largest single step between consecutive positions, px. */
  maxStepPx: number;
  /** Distance from the last known position to the press point when no moves preceded it, px. */
  jumpPx: number | null;
  /** Moves whose position changed but movementX/Y were both 0. */
  zeroMovement: number;
  /** Standard deviation of time between moves, ms. */
  intervalStd: number;
  /** Ratio of moves at constant speed (linear tween indicator), 0..1. */
  constantSpeedRatio: number;
}

export interface ClickRecord extends PageFlags {
  kind: "click";
  index: number;
  t: number;
  trusted: boolean;
  /** Click arrived with no pointerdown before it (keyboard activation or script). */
  synthetic: boolean;
  pointerType: string;
  target: TargetInfo | null;
  x: number;
  y: number;
  /** Distance from the target's centre, px. */
  offsetPx: number | null;
  /** offsetPx divided by half the target diagonal. 0 = exact centre. */
  offsetNorm: number | null;
  approach: ApproachStats;
  /** Pointer entered the target → press, ms. Null when no enter was seen. */
  hoverMs: number | null;
  /** Press → release, ms. */
  pressMs: number | null;
  /** Ms since the previous action of any kind. */
  gapMs: number | null;
  /** Pointer moves between the previous action and this click's approach window. */
  idleMoves: number;
  /** Trusted pointer events with screenX/screenY 0 while clientX/clientY are not (impossible for a real pointer). */
  noScreenPosition: boolean;
  /** offsetX/offsetY were 0 although the press was not at the element's corner (positionless synthetic click). */
  positionless: boolean;
  /** pointerdown pressure was 0 with a button held. Real mice report 0.5. */
  zeroPressure: boolean;
  /** Mouse press at a fractional CSS pixel while devicePixelRatio is 1 (real mice report whole pixels). */
  fractional: boolean;
  /** Stack-marker driver ids found when the event was untrusted. */
  stackMarkers?: string[];
}

export interface TypingRecord extends PageFlags {
  kind: "typing";
  index: number;
  t: number;
  end: number;
  target: TargetInfo | null;
  /** Non-modifier keydowns. */
  keys: number;
  /** Time between consecutive keydowns, ms. */
  gaps: number[];
  /** keydown → keyup per key, ms. */
  holds: number[];
  /** Keydowns that happened while another key was still down. */
  rollovers: number;
  corrections: number;
  /** Trusted insert input events with no keydown just before them. */
  insertNoKey: number;
  /** Characters inserted by those events. */
  charsNoKey: number;
  /** Of those, events inserting exactly one character. */
  insertSingles: number;
  /** insertFromPaste input events. */
  pastes: number;
  /** Paste events (clipboard) seen. */
  pasteEvents: number;
  /** Paste shortcut keydowns (Ctrl/Cmd+V) seen. */
  pasteShortcuts: number;
  /** Context menus opened shortly before a paste (paste from the right-click menu). */
  pasteMenus: number;
  /** Shifted characters typed with shiftKey set but no Shift keydown. */
  phantomShift: number;
  /** Untrusted paste events (a script built a ClipboardEvent). */
  syntheticPastes: number;
  /** Trusted keydowns with an empty key and code (CDP keys sent with text only). */
  blankKeys: number;
  /** Untrusted change fired before input on the same field (reverse of browser order). */
  changeBeforeInput: number;
  /** Untrusted input/change on a non-sensitive field with no trusted interaction before it. */
  untrustedInputs: number;
  /** Value length grew with no input or key events at all (direct value set). */
  silentValueSets: number;
  gapMs: number | null;
  idleMoves: number;
  stackMarkers?: string[];
}

export interface ScrollRecord extends PageFlags {
  kind: "scroll";
  index: number;
  t: number;
  end: number;
  wheels: number;
  /** Absolute wheel deltaY values in px (deltaMode normalised). */
  deltas: number[];
  /** Scroll events with no wheel, key, touch or pointer input just before them. */
  programmatic: number;
  scrolls: number;
  gapMs: number | null;
  idleMoves: number;
}

export interface FormRecord extends PageFlags {
  kind: "form";
  index: number;
  t: number;
  target: TargetInfo | null;
  /** `select-no-interaction`: a select changed with no pointer or key on it. */
  reason: "select-no-interaction";
  gapMs: number | null;
  idleMoves: number;
}

export type ActionRecord = ClickRecord | TypingRecord | ScrollRecord | FormRecord;

/** Raw timing streams for lab mode. Positions and timings only. */
export interface LabStreamEvent {
  t: number;
  e: string;
  x?: number;
  y?: number;
  c?: number;
  tr?: boolean;
  k?: string;
  it?: string;
  n?: number;
  tg?: number;
  /** Pointer pressure. */
  p?: number;
  /** screenX, to spot positionless synthetic input. */
  sx?: number;
}
