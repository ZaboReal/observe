import type { ActionRecord, ClickRecord, ScrollRecord, TypingRecord } from "../capture/records";
import type { DriverSignature, MechanicsProfile } from "../registry/types";
import type { Reason } from "../types";
import { cv, median, round } from "../util/stats";
import { makeReason, type RuleId } from "./rules";

const inRange = (v: number | null | undefined, r: [number, number] | undefined) =>
  v !== null && v !== undefined && r !== undefined && v >= r[0] && v <= r[1];

/**
 * Turns one action record into evidence. Pure: depends only on the record, recent history and the driver list.
 * `history` holds earlier records, oldest first, excluding `rec`.
 */
export function analyzeAction(rec: ActionRecord, history: readonly ActionRecord[], drivers: readonly DriverSignature[]): Reason[] {
  const out: Reason[] = [];
  const add = (id: RuleId, extra?: Parameters<typeof makeReason>[2]) => out.push(makeReason(id, rec.t, extra));

  if (rec.kind === "click") analyzeClick(rec, history, add);
  else if (rec.kind === "typing") analyzeTyping(rec, add);
  else if (rec.kind === "scroll") analyzeScroll(rec, add);
  else if (rec.kind === "form") add("form.select-no-interaction", { drivers: { "gemini-in-chrome": 1 } });

  if ("stackMarkers" in rec && rec.stackMarkers?.length) {
    add("env.stack-marker", { detail: rec.stackMarkers.join(", "), drivers: Object.fromEntries(rec.stackMarkers.map((d) => [d, 6])) });
  }

  analyzeCadence(rec, history, add);

  const hints = mechanicsHints(rec, history, drivers);
  if (Object.keys(hints).length) add("driver.mechanics", { drivers: hints, detail: Object.keys(hints).join(", ") });
  return out;
}

type Add = (id: RuleId, extra?: Parameters<typeof makeReason>[2]) => void;

function analyzeClick(c: ClickRecord, history: readonly ActionRecord[], add: Add): void {
  if (c.synthetic && !c.trusted) {
    add("click.untrusted");
    return;
  }
  if (c.hidden) add("click.hidden");
  else if (!c.focused) add("click.unfocused");
  if (c.noScreenPosition) add("pointer.no-screen-position", { detail: "screenX/screenY 0", drivers: { "gemini-in-chrome": 0.8, "brave-leo": 0.8 } });
  if (c.positionless) add("click.positionless", { detail: "offsetX/offsetY 0", drivers: { "gemini-in-chrome": 0.5, "brave-leo": 0.5 } });
  if (c.zeroPressure) add("click.zero-pressure");
  if (c.fractional) add("pointer.fractional", { detail: `${c.x}, ${c.y}`, drivers: { "chatgpt-agent": 1 } });

  // Touch and pen taps legitimately land without a hover path.
  const mouse = c.pointerType === "mouse";
  const a = c.approach;
  if (mouse) {
    const jump = a.jumpPx ?? (a.moves <= 2 ? a.maxStepPx : 0);
    if (a.moves <= 2 && jump > 80) add("pointer.teleport", { detail: `${a.moves} move${a.moves === 1 ? "" : "s"}, ${Math.round(jump)} px jump` });
    else if (a.moves >= 4 && a.constantSpeedRatio > 0.8 && a.straightness > 0.98) add("pointer.linear", { detail: `${a.moves} evenly spaced moves` });
    else if (a.moves >= 8 && a.straightness < 0.97 && a.constantSpeedRatio < 0.5) add("pointer.human-path", { detail: `${a.moves} moves, ${a.coalesced} samples` });
    // Positions are fractional but movement deltas whole pixels, so small real moves read as zero: count it only
    // when nearly every move on the way had none.
    if (a.zeroMovement >= 3 && a.zeroMovement >= a.moves * 0.8) add("pointer.zero-movement", { detail: `${a.zeroMovement} moves` });

    if (c.hoverMs === null || c.hoverMs <= 15) add("click.no-hover", { detail: c.hoverMs === null ? "no hover" : `${Math.round(c.hoverMs)} ms` });
  }

  const big = c.target?.rect && c.target.rect.w >= 12 && c.target.rect.h >= 12;
  if (big && c.offsetPx !== null && c.offsetPx <= 0.6) add("click.centre", { detail: `${round(c.offsetPx, 1)} px` });
  else if (c.offsetNorm !== null && c.offsetNorm > 0.08) add("click.off-centre", { detail: `${Math.round(c.offsetPx ?? 0)} px` });

  if (c.pressMs !== null) {
    // A trackpad's tap-to-click also releases within a few ms; after a real approach path and a hover it is a person.
    const tap = mouse && (c.hoverMs ?? 0) > 40 && a.moves >= 3;
    if (c.pressMs <= 6 && !tap) add("click.short-press", { detail: `${round(c.pressMs, 1)} ms` });
    else if (c.pressMs >= 40 && c.pressMs <= 300) add("click.human-press", { detail: `${Math.round(c.pressMs)} ms` });
  }

  // Machine regularity: the same press or hover time on every click.
  const clicks = [...history.filter((r): r is ClickRecord => r.kind === "click" && r.trusted && r.pressMs !== null).slice(-5), c].filter(
    (r) => r.pressMs !== null,
  );
  if (clicks.length >= 4) {
    const presses = clicks.map((r) => r.pressMs as number);
    const hovers = clicks.map((r) => r.hoverMs).filter((v): v is number => v !== null);
    const pressFixed = median(presses) > 20 && (cv(presses) ?? 1) < 0.05;
    const hoverFixed = hovers.length >= 4 && median(hovers) > 20 && (cv(hovers) ?? 1) < 0.05;
    if (pressFixed || hoverFixed) add("click.fixed-timing", { detail: pressFixed ? `press ${Math.round(median(presses))} ms every time` : `hover ${Math.round(median(hovers))} ms every time` });
  }
}

function analyzeTyping(r: TypingRecord, add: Add): void {
  if (r.hidden && (r.keys > 0 || r.insertNoKey > 0)) add("typing.hidden");
  if (r.untrustedInputs > 0) add("typing.untrusted", { detail: `${r.untrustedInputs} event${r.untrustedInputs === 1 ? "" : "s"}` });
  if (r.silentValueSets > 0) add("typing.silent-set");
  // More characters arrived without keys than keys were pressed (an Enter or Tab after a fill does not hide it).
  if (r.charsNoKey >= 2 && r.charsNoKey > r.keys * 2) {
    add("typing.insert-no-keys", { detail: `${r.charsNoKey} chars in ${r.insertNoKey} event${r.insertNoKey === 1 ? "" : "s"}` });
    if (r.insertSingles >= 3) add("typing.insert-per-char", { detail: `${r.insertSingles} single-char inserts` });
  }
  if (r.pastes > 0 && r.pasteShortcuts === 0 && r.pasteMenus === 0) add("typing.paste-no-event", { detail: r.pasteEvents ? "paste event, no shortcut" : "no paste event" });
  if (r.phantomShift > 0) add("typing.phantom-shift", { detail: `${r.phantomShift} key${r.phantomShift === 1 ? "" : "s"}`, drivers: { "claude-in-chrome": 0.5, "gemini-in-chrome": 0.3, "brave-leo": 0.3 } });
  if (r.syntheticPastes > 0) add("typing.synthetic-paste", { drivers: { "chatgpt-extension": 1, "chatgpt-desktop": 0.5 } });
  if (r.blankKeys >= 2) add("typing.blank-keys", { detail: `${r.blankKeys} keys`, drivers: { taxy: 1 } });
  if (r.changeBeforeInput > 0) add("form.change-before-input", { drivers: { "claude-in-chrome": 1, nanobrowser: 0.5 } });

  const gaps = r.gaps.filter((g) => g < 2000);
  if (gaps.length >= 4) {
    const m = median(gaps);
    const v = cv(gaps);
    if (m < 25) add("typing.fast-gaps", { detail: `median ${round(m, 1)} ms` });
    else if (Number.isFinite(v) && v < 0.15) add("typing.machine-gaps", { detail: `${Math.round(m)} ms, cv ${round(v, 2)}` });
    else if (m >= 60 && m <= 600 && Number.isFinite(v) && v > 0.3) add("typing.human-rhythm", { detail: `median ${Math.round(m)} ms` });
  }
  if (r.holds.length >= 4 && median(r.holds) < 4) add("typing.no-holds", { detail: `median ${round(median(r.holds), 1)} ms` });
  if (r.rollovers >= 1 && r.keys >= 4) add("typing.rollover", { detail: `${r.rollovers}` });
}

function analyzeScroll(s: ScrollRecord, add: Add): void {
  if (s.programmatic > 0) add("scroll.programmatic", { detail: `${s.programmatic} scroll event${s.programmatic === 1 ? "" : "s"}` });
  // Midscene scrolls by ±9999999 to reach an end; Skyvern nudges dropdowns with 1e-5. No wheel or trackpad does either.
  if (s.deltas.some((x) => x >= 1e6 || (x > 0 && x < 0.001))) add("scroll.absurd-wheel", { detail: `${s.deltas.find((x) => x >= 1e6 || (x > 0 && x < 0.001))} px`, drivers: { midscene: 1, skyvern: 1 } });
  if (s.wheels >= 3) {
    const d = s.deltas;
    const allHundreds = d.every((x) => x > 0 && Math.abs(x / 100 - Math.round(x / 100)) < 1e-6);
    if (allHundreds && (cv(d) || 0) < 0.01) add("scroll.uniform-wheel", { detail: `${s.wheels} × ${d[0]} px` });
    const distinct = new Set(d.map((x) => Math.round(x))).size;
    if (s.wheels >= 6 && distinct >= 4 && d.some((x) => x < 10)) add("scroll.trackpad");
  }
}

function analyzeCadence(rec: ActionRecord, history: readonly ActionRecord[], add: Add): void {
  const prev = history[history.length - 1];
  // A person needs well over 50 ms to move from one control to another. Batched agent actions do not.
  // Momentum scrolling keeps firing after the fingers lift, and a typing run only ends when the next click takes
  // focus away, so an action right after either is not evidence. A scroll burst itself spans time (one that began
  // before a click is recorded after it, 0 ms later), so it never counts either.
  const spans = (r: ActionRecord) => r.kind === "scroll" || r.kind === "typing";
  if (prev && rec.gapMs !== null && rec.gapMs < 50 && targetOf(prev) !== targetOf(rec) && !spans(prev) && rec.kind !== "scroll") {
    add("cadence.superhuman", { detail: `${Math.round(rec.gapMs)} ms after the previous action` });
  }
  const recent = [...history.slice(-3), rec];
  if (recent.length < 4) return;
  const paused = recent.filter((r) => r.gapMs !== null && r.gapMs > 1500);
  if (paused.length >= 3 && paused.every((r) => r.idleMoves === 0) && recent.some((r) => r.kind === "click")) {
    add("cadence.still", { detail: `${paused.length} pauses, no motion` });
  } else if (recent.filter((r) => r.idleMoves >= 5).length >= 3) {
    add("cadence.micro-motion");
  }
}

function targetOf(r: ActionRecord): number | undefined {
  return "target" in r ? r.target?.ordinal : undefined;
}

/** Driver hints from the registry's mechanics profiles. Naming only; never moves the verdict. */
export function mechanicsHints(rec: ActionRecord, history: readonly ActionRecord[], drivers: readonly DriverSignature[]): Record<string, number> {
  const hints: Record<string, number> = {};
  const bump = (id: string, w: number) => (hints[id] = round((hints[id] ?? 0) + w, 2));
  for (const d of drivers) {
    const m: MechanicsProfile | undefined = d.mechanics;
    if (!m) continue;
    if (rec.kind === "click" && rec.trusted && rec.pointerType === "mouse") {
      const hover = inRange(rec.hoverMs, m.hoverMs);
      const press = inRange(rec.pressMs, m.pressMs);
      if (m.hoverMs && m.pressMs && hover && press) bump(d.id, 1);
      else if (!m.hoverMs && m.pressMs && press && m.teleports && rec.approach.moves <= 2) bump(d.id, 0.3);
    }
    if (rec.kind === "typing") {
      const keysOnly = rec.keys >= 3 && rec.insertNoKey === 0;
      if (m.typing === "insert-per-char" && rec.insertSingles >= 3 && rec.keys === 0) bump(d.id, 1.5);
      if (m.typing === "insert-bulk" && rec.insertNoKey >= 1 && rec.insertSingles === 0 && rec.keys === 0) bump(d.id, 0.6);
      if (m.typing === "value-set" && (rec.untrustedInputs > 0 || rec.silentValueSets > 0)) bump(d.id, 0.6);
      if (m.typing === "paste" && rec.pastes > 0 && rec.keys === 0) bump(d.id, 0.5);
      if (m.typing === "synthetic-paste" && rec.syntheticPastes > 0) bump(d.id, 1);
      if (m.keyHoldMs && rec.holds.length >= 3 && inRange(median(rec.holds), m.keyHoldMs)) bump(d.id, 0.6);
      if (m.typing === "keys" && keysOnly && m.keyGapMs) {
        const g = median(rec.gaps.filter((x) => x < 2000));
        if (inRange(g, m.keyGapMs)) bump(d.id, 1.2);
      }
    }
    if (rec.kind === "scroll") {
      if (m.scroll === "no-wheel" && rec.programmatic > 0 && rec.wheels === 0) bump(d.id, 0.6);
      if (m.scroll === "wheel-100" && rec.wheels >= 2 && rec.deltas.every((x) => x === 100)) bump(d.id, 0.4);
    }
  }
  void history;
  return hints;
}
