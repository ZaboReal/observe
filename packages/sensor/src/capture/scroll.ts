import type { CaptureContext } from "./context";
import type { ScrollRecord } from "./records";

const BURST_IDLE_MS = 700;
/** A scroll this long after the last wheel/key/touch/pointer input has no input behind it. */
const NO_INPUT_MS = 900;
/** Ignore early scrolls: scroll restoration and anchor jumps on load. */
const STARTUP_GRACE_MS = 1500;

interface Burst {
  t: number;
  last: number;
  wheels: number;
  deltas: number[];
  programmatic: number;
  scrolls: number;
  hidden: boolean;
  focused: boolean;
}

export class ScrollTracker {
  private burst: Burst | null = null;
  private lastWheelT = -Infinity;

  constructor(private readonly ctx: CaptureContext) {}

  onWheel(e: WheelEvent): void {
    const t = this.ctx.t();
    if (e.isTrusted) this.ctx.lastTrustedInputT = t;
    this.lastWheelT = t;
    const b = this.ensure(t);
    b.wheels++;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? (typeof window !== "undefined" ? window.innerHeight : 800) : 1;
    b.deltas.push(Math.abs(e.deltaY * unit));
    b.last = t;
    if (this.ctx.lab) this.ctx.stream({ t, e: "wh", y: Math.round(e.deltaY * unit), tr: e.isTrusted });
  }

  onTouch(): void {
    this.ctx.lastTouchT = this.ctx.t();
  }

  onScroll(): void {
    const t = this.ctx.t();
    const b = this.ensure(t);
    b.scrolls++;
    b.last = t;
    if (t < STARTUP_GRACE_MS) return;
    const lastInput = Math.max(
      this.lastWheelT,
      this.ctx.lastScrollKeyT,
      this.ctx.lastTouchT,
      this.ctx.lastTrustedInputT,
    );
    const quiet = t - lastInput > NO_INPUT_MS;
    const notFocusJump = t - this.ctx.lastFocusChangeT > 600;
    const notNavigation = t - this.ctx.lastNavigationT > 1500;
    if (quiet && notFocusJump && notNavigation && this.ctx.buttonsDown === 0) b.programmatic++;
    if (this.ctx.lab) this.ctx.stream({ t, e: "sc" });
  }

  tick(): void {
    if (this.burst && this.ctx.t() - this.burst.last > BURST_IDLE_MS) this.finalize();
  }

  finalize(): void {
    const b = this.burst;
    if (!b) return;
    this.burst = null;
    if (b.wheels === 0 && b.programmatic === 0) return;
    const { index, gapMs, idleMoves } = this.ctx.beginAction(b.t);
    const rec: ScrollRecord = {
      kind: "scroll",
      index,
      t: b.t,
      end: b.last,
      wheels: b.wheels,
      deltas: b.deltas.slice(0, 64),
      programmatic: b.programmatic,
      scrolls: b.scrolls,
      gapMs,
      idleMoves,
      hidden: b.hidden,
      focused: b.focused,
    };
    this.ctx.emit(rec);
  }

  private ensure(t: number): Burst {
    if (!this.burst) {
      const flags = this.ctx.flags();
      this.burst = { t, last: t, wheels: 0, deltas: [], programmatic: 0, scrolls: 0, hidden: flags.hidden, focused: flags.focused };
    }
    return this.burst;
  }
}
