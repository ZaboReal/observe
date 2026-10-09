import { median, std, dist } from "../util/stats";
import { asElement, describeTarget, type TargetInfo } from "../util/target";
import type { CaptureContext } from "./context";
import { SAME_TASK_MS } from "./keyboard";
import type { ApproachStats, ClickRecord } from "./records";

/** Safari (desktop and iOS), not Chrome or another browser that also says "Safari" in its user agent. */
const SAFARI =
  typeof navigator !== "undefined" && /Safari\//.test(navigator.userAgent) && !/Chrome\/|Chromium\/|CriOS|FxiOS|EdgiOS|Edg\//.test(navigator.userAgent);

interface Sample {
  t: number;
  x: number;
  y: number;
  coalesced: number;
  zeroMovement: boolean;
}

interface PendingClick {
  fractional: boolean;
  noScreenPosition: boolean;
  positionless: boolean;
  zeroPressure: boolean;
  t: number;
  el: Element | null;
  target: TargetInfo | null;
  trusted: boolean;
  pointerType: string;
  x: number;
  y: number;
  approach: ApproachStats;
  hoverMs: number | null;
  stackMarkers?: string[];
  hidden: boolean;
  focused: boolean;
}

const MAX_SAMPLES = 512;
const APPROACH_WINDOW_MS = 800;

/** Tracks pointer movement and turns each press into a ClickRecord. */
export class PointerTracker {
  private samples: Sample[] = [];
  private lastPos: { x: number; y: number; t: number } | null = null;
  private overEl: Element | null = null;
  private overT = 0;
  private pending: PendingClick | null = null;
  private lastDownT = -Infinity;
  /** Trusted moves with no screen position since the last press. */
  private noScreenMoves = 0;

  constructor(private readonly ctx: CaptureContext) {}

  onMove(e: PointerEvent): void {
    const t = this.ctx.t();
    let coalesced = 1;
    try {
      const list = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
      if (list && list.length) coalesced = list.length;
    } catch {
      /* ignore */
    }
    const moved = this.lastPos ? this.lastPos.x !== e.clientX || this.lastPos.y !== e.clientY : true;
    // Safari reports movementX/movementY as 0 on every pointer move, so there it says nothing about automation.
    const zeroMovement = !SAFARI && moved && e.isTrusted && e.movementX === 0 && e.movementY === 0 && this.lastPos !== null;
    if (noScreenPosition(e)) this.noScreenMoves++;
    const s: Sample = { t, x: e.clientX, y: e.clientY, coalesced, zeroMovement };
    this.samples.push(s);
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    this.lastPos = { x: e.clientX, y: e.clientY, t };
    this.ctx.countMove();
    if (this.ctx.lab) this.ctx.stream({ t, e: "pm", x: e.clientX, y: e.clientY, c: coalesced, tr: e.isTrusted });
  }

  onOver(e: PointerEvent): void {
    this.overEl = asElement(e.target);
    this.overT = this.ctx.t();
  }

  onDown(e: PointerEvent): void {
    const t = this.ctx.t();
    const el = asElement(e.target);
    if (e.isTrusted) this.ctx.noteInteraction(el, t);
    this.ctx.buttonsDown++;
    this.lastDownT = t;
    const approach = this.approach(t, e.clientX, e.clientY);
    let hoverMs: number | null = null;
    if (this.overEl && el && (this.overEl === el || this.overEl.contains(el) || el.contains(this.overEl))) {
      hoverMs = Math.max(0, t - this.overT);
    }
    const flags = this.ctx.flags();
    const target = describeTarget(el);
    const r = target?.rect;
    const awayFromCorner = r ? e.clientX - r.x > 1.5 || e.clientY - r.y > 1.5 : false;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
    this.pending = {
      fractional: e.isTrusted && e.pointerType === "mouse" && dpr === 1 && (e.clientX % 1 !== 0 || e.clientY % 1 !== 0),
      noScreenPosition: noScreenPosition(e) || this.noScreenMoves > 0,
      positionless: e.isTrusted && e.offsetX === 0 && e.offsetY === 0 && awayFromCorner,
      zeroPressure: e.isTrusted && e.pointerType === "mouse" && e.buttons > 0 && e.pressure === 0,
      t,
      el,
      target,
      trusted: e.isTrusted,
      pointerType: e.pointerType || "mouse",
      x: e.clientX,
      y: e.clientY,
      approach,
      hoverMs,
      hidden: flags.hidden,
      focused: flags.focused,
    };
    if (!e.isTrusted) {
      const markers = this.ctx.stackMarkers();
      if (markers) this.pending.stackMarkers = markers;
    }
    this.noScreenMoves = 0;
    this.lastPos = { x: e.clientX, y: e.clientY, t };
    if (this.ctx.lab) this.ctx.stream({ t, e: "pd", x: e.clientX, y: e.clientY, tr: e.isTrusted, tg: this.pending.target?.ordinal, p: e.pressure, sx: e.screenX });
  }

  onUp(e: PointerEvent): void {
    const t = this.ctx.t();
    this.ctx.buttonsDown = Math.max(0, this.ctx.buttonsDown - 1);
    if (this.ctx.lab) this.ctx.stream({ t, e: "pu", x: e.clientX, y: e.clientY, tr: e.isTrusted });
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.emitClick(p, Math.max(0, t - p.t), false);
  }

  onCancel(): void {
    this.ctx.buttonsDown = Math.max(0, this.ctx.buttonsDown - 1);
    this.pending = null;
  }

  /** Clicks with no pointerdown before them: keyboard activation or script. */
  onClick(e: MouseEvent): void {
    const t = this.ctx.t();
    if (t - this.lastDownT < 1500) return; // already covered by the pointerdown/up pair
    const el = asElement(e.target);
    // A trusted click with no pointerdown is keyboard activation (Enter/Space, detail 0). Not evidence.
    if (e.isTrusted) return;
    // Untrusted click. Ignore when it is part of a chain started by a real input (e.g. a label or custom control).
    if (t - this.ctx.lastTrustedInputT < SAME_TASK_MS) return;
    if (this.ctx.isIgnored(el)) return;
    const flags = this.ctx.flags();
    const approach = this.approach(t, e.clientX, e.clientY);
    const p: PendingClick = {
      fractional: false,
      noScreenPosition: false,
      positionless: false,
      zeroPressure: false,
      t,
      el,
      target: describeTarget(el),
      trusted: false,
      pointerType: "none",
      x: e.clientX,
      y: e.clientY,
      approach,
      hoverMs: null,
      hidden: flags.hidden,
      focused: flags.focused,
    };
    const markers = this.ctx.stackMarkers();
    if (markers) p.stackMarkers = markers;
    this.emitClick(p, null, true);
  }

  private emitClick(p: PendingClick, pressMs: number | null, synthetic: boolean): void {
    const { index, gapMs, idleMoves } = this.ctx.beginAction(p.t, p.approach.moves);
    let offsetPx: number | null = null;
    let offsetNorm: number | null = null;
    const r = p.target?.rect;
    if (r && r.w > 0 && r.h > 0 && !synthetic) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      offsetPx = dist(cx, cy, p.x, p.y);
      offsetNorm = offsetPx / (0.5 * Math.sqrt(r.w * r.w + r.h * r.h));
    }
    const rec: ClickRecord = {
      kind: "click",
      index,
      t: p.t,
      trusted: p.trusted,
      synthetic,
      pointerType: p.pointerType,
      target: p.target,
      x: p.x,
      y: p.y,
      offsetPx,
      offsetNorm,
      approach: p.approach,
      hoverMs: p.hoverMs,
      pressMs,
      gapMs,
      idleMoves,
      noScreenPosition: p.noScreenPosition,
      fractional: p.fractional,
      positionless: p.positionless,
      zeroPressure: p.zeroPressure,
      hidden: p.hidden,
      focused: p.focused,
    };
    if (p.stackMarkers) rec.stackMarkers = p.stackMarkers;
    this.ctx.emit(rec);
  }

  private approach(t: number, x: number, y: number): ApproachStats {
    const from = t - APPROACH_WINDOW_MS;
    let firstIdx = this.samples.length;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if ((this.samples[i] as Sample).t < from) break;
      firstIdx = i;
    }
    const win = this.samples.slice(firstIdx);
    const before = firstIdx > 0 ? this.samples[firstIdx - 1] : undefined;
    let pathPx = 0;
    let maxStepPx = 0;
    let coalesced = 0;
    let zeroMovement = 0;
    const speeds: number[] = [];
    const intervals: number[] = [];
    let prev: { x: number; y: number; t: number } | undefined = before;
    for (const s of win) {
      coalesced += s.coalesced;
      if (s.zeroMovement) zeroMovement++;
      if (prev) {
        const step = dist(prev.x, prev.y, s.x, s.y);
        pathPx += step;
        if (step > maxStepPx) maxStepPx = step;
        const dt = s.t - prev.t;
        if (dt > 0) {
          intervals.push(dt);
          speeds.push(step / dt);
        }
      }
      prev = s;
    }
    const last = win[win.length - 1];
    if (last) {
      const tail = dist(last.x, last.y, x, y);
      pathPx += tail;
      if (tail > maxStepPx) maxStepPx = tail;
    }
    const origin = before ?? win[0];
    const directPx = origin ? dist(origin.x, origin.y, x, y) : 0;
    let jumpPx: number | null = null;
    if (win.length === 0) {
      jumpPx = this.lastPos ? dist(this.lastPos.x, this.lastPos.y, x, y) : null;
      if (jumpPx !== null && jumpPx > maxStepPx) maxStepPx = jumpPx;
    }
    let constantSpeedRatio = 0;
    if (speeds.length >= 4) {
      const m = median(speeds);
      if (m > 0) constantSpeedRatio = speeds.filter((v) => Math.abs(v - m) / m < 0.1).length / speeds.length;
    }
    return {
      moves: win.length,
      coalesced,
      pathPx,
      directPx,
      straightness: pathPx > 0 ? Math.min(1, directPx / pathPx) : 1,
      maxStepPx,
      jumpPx,
      zeroMovement,
      intervalStd: intervals.length >= 2 ? std(intervals) : NaN,
      constantSpeedRatio,
    };
  }
}

/** A real pointer always has a screen position at least as far from the origin as its client position. */
function noScreenPosition(e: MouseEvent): boolean {
  return e.isTrusted && e.screenX === 0 && e.screenY === 0 && (e.clientX > 0 || e.clientY > 0);
}
