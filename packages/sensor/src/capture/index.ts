import { IGNORE_ATTR } from "../probes/artifacts";
import type { RegistryIndex } from "../registry";
import { hasWindow } from "../util/env";
import { asElement, describeTarget } from "../util/target";
import { CaptureContext } from "./context";
import { TypingTracker } from "./keyboard";
import { PointerTracker } from "./pointer";
import type { ActionRecord, FormRecord, LabStreamEvent } from "./records";
import { ScrollTracker } from "./scroll";

export type { ActionRecord, ClickRecord, TypingRecord, ScrollRecord, FormRecord, LabStreamEvent } from "./records";
export { CaptureContext } from "./context";

export interface CaptureOptions {
  /** Milliseconds since the sensor started. */
  clock: () => number;
  registry: RegistryIndex;
  onRecord: (r: ActionRecord) => void;
  onLab?: (e: LabStreamEvent) => void;
  onPageChange?: (state: { hidden: boolean; focused: boolean }) => void;
  ignoreSelector?: string;
}

type Binding = [EventTarget, string, EventListener];

/** Registers capture-phase, passive listeners and routes events to the trackers. */
export class Capture {
  readonly ctx: CaptureContext;
  private pointer: PointerTracker;
  private typing: TypingTracker;
  private scroll: ScrollTracker;
  private bindings: Binding[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: CaptureOptions) {
    this.ctx = new CaptureContext(opts.clock, opts.registry, opts.onRecord, opts.onLab ?? null, opts.ignoreSelector);
    this.pointer = new PointerTracker(this.ctx);
    this.typing = new TypingTracker(this.ctx);
    this.scroll = new ScrollTracker(this.ctx);
  }

  start(): void {
    if (!hasWindow || this.bindings.length) return;
    const w = window;
    const d = document;
    const on = (target: EventTarget, type: string, fn: (e: never) => void) => {
      const handler = ((e: Event) => {
        try {
          // Ignore interaction with the sensor's own debug UI.
          const el = asElement(e.target);
          if (el && el.closest?.(`[${IGNORE_ATTR}]`)) return;
          (fn as (e: Event) => void)(e);
        } catch {
          /* never break the host page */
        }
      }) as EventListener;
      target.addEventListener(type, handler, { capture: true, passive: true });
      this.bindings.push([target, type, handler]);
    };

    on(w, "pointermove", (e: PointerEvent) => this.pointer.onMove(e));
    on(w, "pointerover", (e: PointerEvent) => this.pointer.onOver(e));
    on(w, "pointerdown", (e: PointerEvent) => this.pointer.onDown(e));
    on(w, "pointerup", (e: PointerEvent) => this.pointer.onUp(e));
    on(w, "pointercancel", () => this.pointer.onCancel());
    on(w, "click", (e: MouseEvent) => this.pointer.onClick(e));

    on(w, "keydown", (e: KeyboardEvent) => this.typing.onKeyDown(e));
    on(w, "keyup", (e: KeyboardEvent) => this.typing.onKeyUp(e));
    on(w, "input", (e: Event) => this.typing.onInput(e));
    on(w, "change", (e: Event) => {
      this.typing.onChange(e);
      this.onSelectChange(e);
    });
    on(w, "paste", (e: ClipboardEvent) => this.typing.onPaste(e));
    on(w, "focusin", (e: FocusEvent) => {
      this.ctx.lastFocusChangeT = this.ctx.t();
      this.typing.onFocusIn(e);
    });
    on(w, "focusout", (e: FocusEvent) => this.typing.onFocusOut(e));

    on(w, "wheel", (e: WheelEvent) => this.scroll.onWheel(e));
    on(w, "touchstart", () => this.scroll.onTouch());
    on(w, "contextmenu", () => (this.ctx.lastContextMenuT = this.ctx.t()));
    on(d, "scroll", () => this.scroll.onScroll());

    on(d, "visibilitychange", () => this.pageChanged());
    on(w, "focus", () => this.pageChanged());
    on(w, "blur", () => this.pageChanged());
    on(w, "hashchange", () => (this.ctx.lastNavigationT = this.ctx.t()));
    on(w, "popstate", () => (this.ctx.lastNavigationT = this.ctx.t()));

    this.timer = setInterval(() => {
      this.typing.tick();
      this.scroll.tick();
    }, 250);
  }

  /** Close open typing runs and scroll bursts so their records are emitted now. */
  flush(): void {
    this.typing.finalize();
    this.scroll.finalize();
  }

  stop(): void {
    this.flush();
    for (const [target, type, handler] of this.bindings) target.removeEventListener(type, handler, { capture: true });
    this.bindings = [];
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private pageChanged(): void {
    const state = this.ctx.flags();
    if (this.ctx.lab) this.ctx.stream({ t: this.ctx.t(), e: state.hidden ? "hid" : state.focused ? "foc" : "blr" });
    this.opts.onPageChange?.(state);
  }

  private onSelectChange(e: Event): void {
    if (!e.isTrusted) return;
    const el = asElement(e.target);
    if (!el || el.localName !== "select") return;
    const t = this.ctx.t();
    const last = this.ctx.lastInteraction(el);
    // A person opens a select with the pointer or keyboard first. A value change with neither is set by a tool.
    if (last !== null && t - last < 30_000) return;
    if (this.ctx.isIgnored(el)) return;
    const { index, gapMs, idleMoves } = this.ctx.beginAction(t);
    const flags = this.ctx.flags();
    const rec: FormRecord = {
      kind: "form",
      index,
      t,
      target: describeTarget(el, false),
      reason: "select-no-interaction",
      gapMs,
      idleMoves,
      hidden: flags.hidden,
      focused: flags.focused,
    };
    this.ctx.emit(rec);
  }
}
