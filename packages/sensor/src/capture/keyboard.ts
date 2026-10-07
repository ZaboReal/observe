import { asElement, describeTarget, type TargetInfo } from "../util/target";
import type { CaptureContext } from "./context";
import type { TypingRecord } from "./records";

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn", "AltGraph", "OS"]);
const SCROLL_KEYS = new Set(["PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End", " ", "Spacebar"]);
const RUN_IDLE_MS = 1200;
/** An insert input event this soon after a keydown is that key's own input. */
const KEY_TO_INPUT_MS = 60;
/** Synthetic events this soon after a real input are part of that input's own handling. */
export const SAME_TASK_MS = 20;

interface Run {
  el: Element | null;
  target: TargetInfo | null;
  t: number;
  last: number;
  keys: number;
  gaps: number[];
  holds: number[];
  rollovers: number;
  corrections: number;
  insertNoKey: number;
  charsNoKey: number;
  insertSingles: number;
  pastes: number;
  pasteEvents: number;
  pasteShortcuts: number;
  pasteMenus: number;
  phantomShift: number;
  syntheticPastes: number;
  blankKeys: number;
  changeBeforeInput: number;
  untrustedInputs: number;
  silentValueSets: number;
  lastKeydownT: number | null;
  hidden: boolean;
  focused: boolean;
  stackMarkers?: string[];
}

/** Keyboard type of a key, never the key itself. */
export function keyClass(key: string): string {
  if (key.length === 1) {
    if (/\d/.test(key)) return "digit";
    if (key === " ") return "space";
    if (/\p{L}/u.test(key)) return "letter";
    return "symbol";
  }
  if (key === "Backspace" || key === "Delete") return "correction";
  if (key === "Enter" || key === "Tab" || key === "Escape") return key.toLowerCase();
  if (key.startsWith("Arrow") || key === "Home" || key === "End" || key.startsWith("Page")) return "nav";
  if (MODIFIERS.has(key)) return "modifier";
  if (key === "Unidentified" || key === "Process") return "ime";
  return "other";
}

/** Groups key and input events per field into typing runs. */
export class TypingTracker {
  private run: Run | null = null;
  private down = new Map<string, number>();
  private focusLen = new WeakMap<Element, number>();
  private runTouched = new WeakSet<Element>();
  private shiftHeld = false;
  private untrustedChangeT = new WeakMap<Element, number>();
  private untrustedInputT = new WeakMap<Element, number>();

  constructor(private readonly ctx: CaptureContext) {}

  onKeyDown(e: KeyboardEvent): void {
    const t = this.ctx.t();
    const key = e.key ?? "";
    if (e.isTrusted) this.ctx.lastTrustedInputT = t;
    if (SCROLL_KEYS.has(key)) this.ctx.lastScrollKeyT = t;
    if ((e.ctrlKey || e.metaKey) && (key === "f" || key === "F")) this.ctx.lastNavigationT = t;
    if (key === "Shift") this.shiftHeld = true;
    if (MODIFIERS.has(key)) return;
    const el = asElement(e.target);
    if (e.isTrusted) this.ctx.noteInteraction(el, t);
    if (this.ctx.lab) this.ctx.stream({ t, e: "kd", k: keyClass(key), tr: e.isTrusted });
    if (!this.isEditable(el)) return;
    const run = this.ensureRun(el, t);
    if ((e.ctrlKey || e.metaKey) && (key === "v" || key === "V")) {
      run.pasteShortcuts++;
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    if (e.repeat) return;
    if (run.lastKeydownT !== null) run.gaps.push(t - run.lastKeydownT);
    let othersDown = 0;
    for (const code of this.down.keys()) if (code !== e.code) othersDown++;
    if (othersDown > 0) run.rollovers++;
    if (key === "Backspace" || key === "Delete") run.corrections++;
    // CDP keyDown sent with only `text` arrives with an empty key and code. IME and touch keyboards are excluded.
    if (e.isTrusted && !e.isComposing && this.ctx.lastTouchT === -Infinity && (key === "" || (key === "Unidentified" && !e.code))) run.blankKeys++;
    // Shifted characters always follow a Shift keydown on a physical keyboard. Touch keyboards are excluded.
    if (e.isTrusted && e.shiftKey && !this.shiftHeld && key.length === 1 && key !== key.toLowerCase() && this.ctx.lastTouchT === -Infinity) {
      run.phantomShift++;
    }
    run.keys++;
    run.lastKeydownT = t;
    run.last = t;
    this.down.set(e.code || key, t);
  }

  onKeyUp(e: KeyboardEvent): void {
    const t = this.ctx.t();
    if (e.key === "Shift") this.shiftHeld = false;
    const code = e.code || e.key || "";
    const start = this.down.get(code);
    if (this.ctx.lab) this.ctx.stream({ t, e: "ku", k: keyClass(e.key ?? ""), tr: e.isTrusted });
    if (start === undefined) return;
    this.down.delete(code);
    if (this.run) {
      this.run.holds.push(t - start);
      this.run.last = t;
    }
  }

  onInput(e: Event): void {
    const t = this.ctx.t();
    const el = asElement(e.target);
    if (!e.isTrusted && el && (el.localName === "select" || this.isEditable(el))) {
      this.untrusted(el, t);
      const changed = this.untrustedChangeT.get(el);
      const inputBefore = this.untrustedInputT.get(el) ?? -Infinity;
      if (changed !== undefined && t - changed < 15 && inputBefore < changed && this.run && this.run.el === el) this.run.changeBeforeInput++;
      this.untrustedInputT.set(el, t);
      return;
    }
    if (!this.isEditable(el)) return;
    const ie = e as InputEvent;
    const inputType = typeof ie.inputType === "string" ? ie.inputType : "";
    if (this.ctx.lab) this.ctx.stream({ t, e: "in", it: inputType, n: ie.data?.length ?? undefined, tr: e.isTrusted });
    const run = this.ensureRun(el, t);
    run.last = t;
    if (!el) return;
    this.runTouched.add(el);
    if (ie.isComposing || inputType === "insertCompositionText" || inputType === "insertReplacementText") return;
    if (inputType === "insertFromPaste" || inputType === "insertFromPasteAsQuotation") {
      run.pastes++;
      return;
    }
    if (!inputType.startsWith("insert")) return;
    const sinceKey = run.lastKeydownT === null ? Infinity : t - run.lastKeydownT;
    if (sinceKey > KEY_TO_INPUT_MS) {
      const n = typeof ie.data === "string" ? ie.data.length : 1;
      run.insertNoKey++;
      run.charsNoKey += n;
      if (n === 1) run.insertSingles++;
    }
  }

  onChange(e: Event): void {
    if (e.isTrusted) return;
    const el = asElement(e.target);
    if (!el || (!this.isEditable(el) && el.localName !== "select")) return;
    const t = this.ctx.t();
    this.untrustedChangeT.set(el, t);
    this.untrusted(el, t);
  }

  onPaste(e: ClipboardEvent): void {
    const el = asElement(e.target);
    if (!this.isEditable(el)) return;
    const t = this.ctx.t();
    if (!e.isTrusted) {
      const info = describeTarget(el, false);
      if (info?.sensitive || this.ctx.isIgnored(el)) return;
      const run = this.ensureRun(el, t);
      run.syntheticPastes++;
      return;
    }
    const run = this.ensureRun(el, t);
    run.pasteEvents++;
    if (t - this.ctx.lastContextMenuT < 15_000 || this.ctx.lastTouchT > -Infinity) run.pasteMenus++;
  }

  onFocusIn(e: FocusEvent): void {
    const el = asElement(e.target);
    if (!el || !this.isEditable(el)) return;
    const len = valueLength(el);
    if (len !== null) this.focusLen.set(el, len);
  }

  onFocusOut(e: FocusEvent): void {
    const el = asElement(e.target);
    if (!el || !this.isEditable(el)) return;
    const before = this.focusLen.get(el);
    const after = valueLength(el);
    // Value grew while focused, but no key, input or paste event touched the field: set directly by script.
    if (before !== undefined && after !== null && after > before && !this.runTouched.has(el)) {
      const info = describeTarget(el, false);
      if (!info?.sensitive && !this.ctx.isIgnored(el)) {
        const run = this.ensureRun(el, this.ctx.t());
        run.silentValueSets++;
      }
    }
    this.runTouched.delete(el);
    this.finalize();
  }

  /** Close the current run when the field changes or typing pauses. */
  tick(): void {
    if (this.run && this.ctx.t() - this.run.last > RUN_IDLE_MS) this.finalize();
  }

  finalize(): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    const meaningful = r.keys + r.insertNoKey + r.pastes + r.untrustedInputs + r.silentValueSets + r.pasteEvents + r.syntheticPastes;
    if (meaningful === 0) return;
    const { index, gapMs, idleMoves } = this.ctx.beginAction(r.t);
    const rec: TypingRecord = {
      kind: "typing",
      index,
      t: r.t,
      end: r.last,
      target: r.target,
      keys: r.keys,
      gaps: r.gaps,
      holds: r.holds,
      rollovers: r.rollovers,
      corrections: r.corrections,
      insertNoKey: r.insertNoKey,
      charsNoKey: r.charsNoKey,
      insertSingles: r.insertSingles,
      pastes: r.pastes,
      pasteEvents: r.pasteEvents,
      pasteShortcuts: r.pasteShortcuts,
      pasteMenus: r.pasteMenus,
      phantomShift: r.phantomShift,
      syntheticPastes: r.syntheticPastes,
      blankKeys: r.blankKeys,
      changeBeforeInput: r.changeBeforeInput,
      untrustedInputs: r.untrustedInputs,
      silentValueSets: r.silentValueSets,
      gapMs,
      idleMoves,
      hidden: r.hidden,
      focused: r.focused,
    };
    if (r.stackMarkers) rec.stackMarkers = r.stackMarkers;
    this.ctx.emit(rec);
  }

  private untrusted(el: Element | null, t: number): void {
    if (!el || this.ctx.isIgnored(el)) return;
    const info = describeTarget(el, false);
    // Password managers fill credential fields with synthetic events; never count those.
    if (info?.sensitive) return;
    const last = this.ctx.lastInteraction(el);
    if (last !== null && t - last < 1000) return;
    // App code that re-dispatches a real input does so in the same task. Agents batching actions are slower than that.
    if (t - this.ctx.lastTrustedInputT < SAME_TASK_MS) return;
    const run = this.ensureRun(el, t);
    run.untrustedInputs++;
    run.last = t;
    const markers = this.ctx.stackMarkers();
    if (markers) run.stackMarkers = [...new Set([...(run.stackMarkers ?? []), ...markers])];
  }

  private ensureRun(el: Element | null, t: number): Run {
    if (this.run && this.run.el !== el) this.finalize();
    if (!this.run) {
      const flags = this.ctx.flags();
      this.run = {
        el,
        target: describeTarget(el, false),
        t,
        last: t,
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
        lastKeydownT: null,
        hidden: flags.hidden,
        focused: flags.focused,
      };
    } else {
      // A run is hidden/unfocused if any part of it was.
      const flags = this.ctx.flags();
      this.run.hidden ||= flags.hidden;
      this.run.focused &&= flags.focused;
    }
    return this.run;
  }

  private isEditable(el: Element | null): boolean {
    if (!el) return false;
    const tag = el.localName;
    if (tag === "textarea") return true;
    if (tag === "input") {
      const type = ((el as HTMLInputElement).type || "text").toLowerCase();
      return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"].includes(type);
    }
    return (el as HTMLElement).isContentEditable === true;
  }
}

function valueLength(el: Element): number | null {
  const v = (el as HTMLInputElement).value;
  if (typeof v === "string") return v.length;
  if ((el as HTMLElement).isContentEditable) return (el.textContent ?? "").length;
  return null;
}
