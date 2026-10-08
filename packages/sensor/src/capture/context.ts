import { matchMarkers, type RegistryIndex } from "../registry";
import { pageState } from "../util/env";
import type { ActionRecord, LabStreamEvent, PageFlags } from "./records";

/** Shared state the trackers read and write. One per running sensor. */
export class CaptureContext {
  private actionIndex = 0;
  private lastActionT: number | null = null;
  private movesSinceAction = 0;
  private interactions = new WeakMap<Element, number>();
  lastTrustedInputT = -Infinity;
  lastFocusChangeT = -Infinity;
  lastNavigationT = -Infinity;
  lastScrollKeyT = -Infinity;
  lastTouchT = -Infinity;
  lastContextMenuT = -Infinity;
  buttonsDown = 0;

  constructor(
    private readonly clock: () => number,
    readonly registry: RegistryIndex,
    private readonly emitRecord: (r: ActionRecord) => void,
    private readonly labSink: ((e: LabStreamEvent) => void) | null,
    private readonly ignoreSelector: string | undefined,
  ) {}

  /** Milliseconds since the sensor started. */
  t(): number {
    return this.clock();
  }

  flags(): PageFlags {
    return pageState();
  }

  countMove(): void {
    this.movesSinceAction++;
  }

  /** Reserve the next action index and return gap/idle stats relative to the previous action. */
  beginAction(t: number, approachMoves = 0): { index: number; gapMs: number | null; idleMoves: number } {
    const index = this.actionIndex++;
    const gapMs = this.lastActionT === null ? null : Math.max(0, t - this.lastActionT);
    const idleMoves = Math.max(0, this.movesSinceAction - approachMoves);
    this.lastActionT = t;
    this.movesSinceAction = 0;
    return { index, gapMs, idleMoves };
  }

  emit(r: ActionRecord): void {
    this.emitRecord(r);
  }

  get lab(): boolean {
    return this.labSink !== null;
  }

  stream(e: LabStreamEvent): void {
    this.labSink?.(e);
  }

  noteInteraction(el: Element | null, t: number): void {
    this.lastTrustedInputT = t;
    let node: Element | null = el;
    // Mark the element and a few ancestors so label/option/inner-span interactions count for the control.
    for (let i = 0; node && i < 4; i++) {
      this.interactions.set(node, t);
      node = node.parentElement;
    }
  }

  lastInteraction(el: Element | null): number | null {
    if (!el) return null;
    return this.interactions.get(el) ?? null;
  }

  isIgnored(el: Element | null): boolean {
    if (!el || !this.ignoreSelector) return false;
    try {
      return el.closest(this.ignoreSelector) !== null;
    } catch {
      return false;
    }
  }

  /** Driver ids whose stack markers appear in the current call stack. Only called for untrusted events. */
  stackMarkers(): string[] | undefined {
    if (this.registry.stackMarkers.length === 0) return undefined;
    let stack = "";
    try {
      stack = new Error().stack ?? "";
    } catch {
      return undefined;
    }
    const hits = matchMarkers(this.registry, this.registry.stackMarkers, stack);
    return hits.size ? [...hits.keys()] : undefined;
  }
}
