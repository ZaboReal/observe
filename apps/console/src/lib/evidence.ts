import { RULES, type RuleDef } from "@observe/sensor";
import type { Robustness } from "./types";

/**
 * What the console keeps of each sensor action record, and the summary of a session that Jev reads.
 * Records hold timing, geometry and counts only (never text or element ids), and arrive from a public
 * endpoint, so every field is validated and bounded here.
 */

export interface ClickAction {
  k: "click";
  i: number;
  trusted: boolean;
  synthetic: boolean;
  pointer: string;
  hoverMs: number | null;
  pressMs: number | null;
  gapMs: number | null;
  moves: number;
  pathPx: number;
  jumpPx: number | null;
  straightness: number;
  constantSpeed: number;
  offset: number | null;
  zeroPressure: boolean;
  fractional: boolean;
  noScreenPosition: boolean;
  positionless: boolean;
  hidden: boolean;
  focused: boolean;
  rules: string[];
}

export interface TypingAction {
  k: "typing";
  i: number;
  keys: number;
  gapMedian: number | null;
  gapSpread: number | null;
  holdMedian: number | null;
  rollovers: number;
  corrections: number;
  insertNoKey: number;
  charsNoKey: number;
  pastes: number;
  blankKeys: number;
  silentValueSets: number;
  untrustedInputs: number;
  phantomShift: number;
  syntheticPastes: number;
  changeBeforeInput: number;
  gapMs: number | null;
  hidden: boolean;
  focused: boolean;
  rules: string[];
}

export interface ScrollAction {
  k: "scroll";
  i: number;
  wheels: number;
  deltaMedian: number | null;
  deltaCommon: number | null;
  programmatic: number;
  scrolls: number;
  gapMs: number | null;
  rules: string[];
}

export interface FormAction {
  k: "form";
  i: number;
  reason: string;
  rules: string[];
}

export type CompactAction = ClickAction | TypingAction | ScrollAction | FormAction;

/** Page-level evidence the sensor reported (overlays, globals, environment), keyed by the sensor's reason key. */
export interface Observation {
  id: string;
  label: string;
  detail?: string;
  robustness?: Robustness;
  /** Settles the verdict on its own, such as navigator.webdriver or an agent overlay. */
  decisive: boolean;
  /** Driver ids this evidence points at, strongest first. */
  drivers: string[];
}

export interface EvidenceInput {
  actions: readonly CompactAction[];
  /** Every action seen, including ones dropped from `actions` by the cap. */
  actionCount: number;
  observations: Iterable<Observation>;
  pages: Iterable<string>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const bool = (v: unknown) => v === true;
const cap = (v: unknown, max = 1_000_000): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(Math.max(-max, Math.min(max, v)) * 10) / 10 : null;
const count = (v: unknown) => Math.max(0, Math.floor(cap(v, 100_000) ?? 0));

function numbers(v: unknown, max = 200): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v.slice(0, max)) {
    const n = cap(x);
    if (n !== null) out.push(n);
  }
  return out;
}

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Coefficient of variation: 0 means perfectly regular timing. */
function spread(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean <= 0) return null;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return Math.round((sd / mean) * 100) / 100;
}

function mostCommon(xs: readonly number[]): number | null {
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: number | null = null;
  let n = 0;
  for (const [x, c] of counts) if (c > n) [best, n] = [x, c];
  return best;
}

function ruleIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const r of v.slice(0, 16)) {
    const id = Array.isArray(r) ? r[0] : null;
    if (typeof id === "string" && id.length > 0 && id.length <= 64) out.push(id);
  }
  return out;
}

/** Validate one `action` record from a sensor batch. `reasons` are the `[ruleId, weight]` pairs sent with it. */
export function compactAction(record: unknown, reasons: unknown): CompactAction | null {
  if (!isObj(record)) return null;
  const i = count(record.index);
  const rules = ruleIds(reasons);
  const gapMs = cap(record.gapMs);
  switch (record.kind) {
    case "click": {
      const a = isObj(record.approach) ? record.approach : {};
      return {
        k: "click",
        i,
        trusted: bool(record.trusted),
        synthetic: bool(record.synthetic),
        pointer: typeof record.pointerType === "string" ? record.pointerType.slice(0, 12) : "",
        hoverMs: cap(record.hoverMs),
        pressMs: cap(record.pressMs),
        gapMs,
        moves: count(a.moves),
        pathPx: cap(a.pathPx) ?? 0,
        jumpPx: cap(a.jumpPx),
        straightness: cap(a.straightness, 1) ?? 0,
        constantSpeed: cap(a.constantSpeedRatio, 1) ?? 0,
        offset: cap(record.offsetNorm, 100),
        zeroPressure: bool(record.zeroPressure),
        fractional: bool(record.fractional),
        noScreenPosition: bool(record.noScreenPosition),
        positionless: bool(record.positionless),
        hidden: bool(record.hidden),
        focused: bool(record.focused),
        rules,
      };
    }
    case "typing": {
      const gaps = numbers(record.gaps);
      const holds = numbers(record.holds);
      return {
        k: "typing",
        i,
        keys: count(record.keys),
        gapMedian: median(gaps),
        gapSpread: spread(gaps),
        holdMedian: median(holds),
        rollovers: count(record.rollovers),
        corrections: count(record.corrections),
        insertNoKey: count(record.insertNoKey),
        charsNoKey: count(record.charsNoKey),
        pastes: count(record.pastes),
        blankKeys: count(record.blankKeys),
        silentValueSets: count(record.silentValueSets),
        untrustedInputs: count(record.untrustedInputs),
        phantomShift: count(record.phantomShift),
        syntheticPastes: count(record.syntheticPastes),
        changeBeforeInput: count(record.changeBeforeInput),
        gapMs,
        hidden: bool(record.hidden),
        focused: bool(record.focused),
        rules,
      };
    }
    case "scroll": {
      const deltas = numbers(record.deltas);
      return {
        k: "scroll",
        i,
        wheels: count(record.wheels),
        deltaMedian: median(deltas),
        deltaCommon: mostCommon(deltas),
        programmatic: count(record.programmatic),
        scrolls: count(record.scrolls),
        gapMs,
        rules,
      };
    }
    case "form":
      return { k: "form", i, reason: typeof record.reason === "string" ? record.reason.slice(0, 40) : "", rules };
    default:
      return null;
  }
}

const share = (n: number, of: number) => (of ? Math.round((n / of) * 100) / 100 : 0);
const sum = <T>(xs: readonly T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const med = <T>(xs: readonly T[], f: (x: T) => number | null) => median(xs.map(f).filter((v): v is number => v !== null));

/** Drop empty fields so the state Jev reads stays short. Zero shares and medians stay: they are evidence. */
function compact(o: Obj): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === false || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

/** A count of zero says nothing worth reading, so leave it out. */
const nz = (n: number) => (n ? n : undefined);

const ruleLabel = (id: string) => (RULES as Record<string, RuleDef>)[id]?.label ?? id;

/**
 * The session as Jev reads it: aggregate input mechanics, what the sensor saw on the page, plain-language
 * observations, and the most recent actions. Contains no rule weights, so Jev weighs the evidence itself.
 */
export function buildEvidence(input: EvidenceInput, driverName: (id: string) => string = (id) => id): Obj {
  const clicks = input.actions.filter((a): a is ClickAction => a.k === "click");
  const typing = input.actions.filter((a): a is TypingAction => a.k === "typing");
  const scrolls = input.actions.filter((a): a is ScrollAction => a.k === "scroll");
  const forms = input.actions.filter((a): a is FormAction => a.k === "form");

  const hits = new Map<string, number>();
  for (const a of input.actions) for (const r of a.rules) hits.set(r, (hits.get(r) ?? 0) + 1);

  const clickCount = clicks.length;
  const n = (k: (c: ClickAction) => boolean) => clicks.filter(k).length;
  const t = (k: (t: TypingAction) => number) => sum(typing, k);
  // Facts real mice, trackpads and keyboards cannot produce, explained so Jev weighs them as such.
  const impossible = [
    [n((c) => c.fractional), `of ${clickCount} mouse presses landed on fractional pixel positions at 1x zoom; real mice and trackpads report whole pixels`],
    [n((c) => c.zeroPressure), "presses had zero pressure while a mouse button was held; real mice report 0.5"],
    [n((c) => c.noScreenPosition), "pointer events had no screen position, which a real pointer always has"],
    [n((c) => c.positionless), "clicks had no position inside the element they hit"],
    [t((x) => x.blankKeys), "key presses had an empty key and code, as DevTools-protocol automation sends them"],
    [t((x) => x.phantomShift), "capital letters arrived with Shift set but no Shift key pressed"],
    [t((x) => x.syntheticPastes), "paste events were built by a script rather than the clipboard"],
    [t((x) => x.silentValueSets), "field values changed with no input or key events at all"],
  ]
    .filter(([count]) => (count as number) > 0)
    .map(([count, what]) => `${count} ${what}`);

  const signals = [...input.observations].slice(0, 30).map((o) => {
    const points = o.drivers.length ? ` (points to ${o.drivers.slice(0, 3).map(driverName).join(", ")})` : "";
    return `${o.label}${o.detail ? `: ${o.detail}` : ""}${points}`;
  });

  return compact({
    pages: [...input.pages].slice(0, 10),
    actions: compact({ total: input.actionCount, clicks: nz(clicks.length), typing_runs: nz(typing.length), scroll_bursts: nz(scrolls.length), form_changes: nz(forms.length) }),
    clicks: clicks.length
      ? compact({
          trusted_share: share(clicks.filter((c) => c.trusted).length, clicks.length),
          pointer_types: [...new Set(clicks.map((c) => c.pointer).filter(Boolean))],
          median_hover_before_press_ms: med(clicks, (c) => c.hoverMs),
          median_press_duration_ms: med(clicks, (c) => c.pressMs),
          median_gap_since_previous_action_ms: med(clicks, (c) => c.gapMs),
          median_pointer_moves_on_approach: med(clicks, (c) => c.moves),
          share_with_no_approach_path: share(clicks.filter((c) => c.moves === 0).length, clicks.length),
          median_jump_px_when_no_path: med(clicks, (c) => (c.moves === 0 ? c.jumpPx : null)),
          median_path_straightness: med(clicks, (c) => (c.moves > 1 ? c.straightness : null)),
          median_offset_from_target_centre: med(clicks, (c) => c.offset),
          clicks_with_no_pointer_down: nz(clicks.filter((c) => c.synthetic).length),
          zero_pressure_presses: nz(clicks.filter((c) => c.zeroPressure).length),
          fractional_pixel_presses: nz(clicks.filter((c) => c.fractional).length),
          presses_with_no_screen_position: nz(clicks.filter((c) => c.noScreenPosition).length),
          positionless_clicks: nz(clicks.filter((c) => c.positionless).length),
          clicks_while_tab_hidden: nz(clicks.filter((c) => c.hidden).length),
        })
      : undefined,
    typing: typing.length
      ? compact({
          runs: typing.length,
          key_presses: sum(typing, (t) => t.keys),
          median_gap_between_keys_ms: med(typing, (t) => t.gapMedian),
          key_gap_spread: med(typing, (t) => t.gapSpread),
          median_key_hold_ms: med(typing, (t) => t.holdMedian),
          overlapping_key_presses: nz(sum(typing, (t) => t.rollovers)),
          corrections: nz(sum(typing, (t) => t.corrections)),
          characters_inserted_without_keys: nz(sum(typing, (t) => t.charsNoKey)),
          inserts_without_keys: nz(sum(typing, (t) => t.insertNoKey)),
          pastes: nz(sum(typing, (t) => t.pastes)),
          keys_with_empty_key_code: nz(sum(typing, (t) => t.blankKeys)),
          values_set_directly_by_script: nz(sum(typing, (t) => t.silentValueSets)),
          untrusted_input_events: nz(sum(typing, (t) => t.untrustedInputs)),
          capitals_without_shift_key: nz(sum(typing, (t) => t.phantomShift)),
          script_built_pastes: nz(sum(typing, (t) => t.syntheticPastes)),
          change_fired_before_input: nz(sum(typing, (t) => t.changeBeforeInput)),
        })
      : undefined,
    scrolling: scrolls.length
      ? compact({
          bursts: scrolls.length,
          wheel_events: sum(scrolls, (s) => s.wheels),
          median_wheel_delta_px: med(scrolls, (s) => s.deltaMedian),
          most_common_wheel_delta_px: med(scrolls, (s) => s.deltaCommon),
          scrolls_with_no_input: nz(sum(scrolls, (s) => s.programmatic)),
        })
      : undefined,
    dropdown_changes_with_no_interaction: nz(forms.length),
    impossible_for_real_hardware: impossible,
    page_signals: signals,
    observations: [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id, n]) => `${ruleLabel(id)} (${n}×)`),
    recent_actions: input.actions.slice(-15).map(recent),
  });
}

function recent(a: CompactAction): Obj {
  switch (a.k) {
    case "click":
      return compact({ kind: "click", hover_ms: a.hoverMs, press_ms: a.pressMs, approach_moves: a.moves, jump_px: a.moves ? null : a.jumpPx, centre_offset: a.offset, untrusted: !a.trusted, pointer: a.pointer });
    case "typing":
      return compact({ kind: "typing", keys: a.keys, median_key_gap_ms: a.gapMedian, median_hold_ms: a.holdMedian, chars_without_keys: a.charsNoKey, pastes: a.pastes, script_value_sets: a.silentValueSets });
    case "scroll":
      return compact({ kind: "scroll", wheels: a.wheels, median_delta_px: a.deltaMedian, no_input_scrolls: a.programmatic });
    case "form":
      return { kind: "dropdown change with no interaction" };
  }
}
