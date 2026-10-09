import type { DriverSignature, MechanicsProfile } from "@observe/sensor";
import type { Tier, Verdict } from "./types";

/**
 * The questions the console asks Jev about a session, and how its answers become a passport.
 * Each agent in the sensor's registry is one option of the `driver` choice, described by its characteristics.
 */

export const HUMAN = "human";
export const UNKNOWN_AUTOMATION = "unknown_automation";

/** Jev's probability that an agent is driving must pass these before the console calls a verdict. */
export const AGENT_AT = 0.85;
export const HUMAN_AT = 0.15;
/** The named driver needs at least this share of the choice's probability, otherwise the agent stays unnamed. */
export const DRIVER_AT = 0.4;
/**
 * Behaviour alone needs at least this many actions before Jev may call an agent; with fewer the session stays
 * undecided. On the first real visitors (arzach.ai, Oct 8) two people were scored 83-86% agent, one of them from 2 actions.
 */
export const MIN_ACTIONS_FOR_AGENT = 5;


const HUMAN_DESCRIPTION =
  "A person using a real mouse, trackpad, touch screen or keyboard. Includes people using assistive technology " +
  "(screen readers, voice dictation, switch access), password-manager or browser autofill, and paste. People move the " +
  "pointer along curved paths with many samples before clicking, hover and press for tens to hundreds of milliseconds, " +
  "land off-centre, and type with uneven gaps (often 60-300 ms) and overlapping keys. Normal for people too: a laptop " +
  "trackpad's tap-to-click presses for only 0-10 ms; Safari reports zero movement deltas on pointer moves; the page " +
  "may scroll by itself after a link is clicked; momentum scrolling keeps going right before the next click; few " +
  "actions on a page that is mostly read. Real hardware never produces the facts listed under " +
  "impossible_for_real_hardware, such as mouse presses at fractional pixel positions at 1x zoom.";

const UNKNOWN_DESCRIPTION =
  "Clearly automated or scripted input that does not match any of the listed products.";

const KIND: Record<DriverSignature["kind"], string> = {
  extension: "browser extension driving the person's own browser",
  "agentic-browser": "AI browser with a built-in agent",
  "built-in-agent": "agent built into a mainstream browser",
  framework: "automation framework",
  "cloud-browser": "agent running in a cloud browser",
  "os-cua": "desktop agent controlling the operating system's mouse and keyboard",
};

const TYPING: Record<NonNullable<MechanicsProfile["typing"]>, string> = {
  "insert-per-char": "text arrives one character at a time with no key presses",
  "insert-bulk": "whole strings are inserted at once with no key presses",
  keys: "real key events with almost no gap between keys",
  paste: "text is pasted",
  "synthetic-paste": "text arrives in script-built paste events",
  "value-set": "field values are set directly by script",
};

const SCROLL: Record<NonNullable<MechanicsProfile["scroll"]>, string> = {
  "wheel-100": "scrolls in wheel steps of exactly 100 px",
  "no-wheel": "the page scrolls with no wheel input",
  gesture: "scrolls with trackpad-like gestures",
  "wheel-buttons": "scrolls with wheel or arrow-button steps",
  wheel: "scrolls with ordinary wheel events",
};

const range = (r: [number, number] | undefined, what: string) => (r ? `${what} ${r[0]}-${r[1]} ms` : null);

/** Trim registry notes to whole sentences so 70 options stay well inside Jev's request limit. */
function trimNotes(notes: string | undefined, max = 360): string | null {
  if (!notes) return null;
  if (notes.length <= max) return notes;
  const cut = notes.slice(0, max);
  const end = cut.lastIndexOf(". ");
  return end > 80 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

export function describeDriver(d: DriverSignature): string {
  const m = d.mechanics;
  const mechanics = m
    ? [
        range(m.hoverMs, "hovers"),
        range(m.pressMs, "presses for"),
        range(m.keyGapMs, "key gaps"),
        range(m.keyHoldMs, "key holds"),
        m.typing ? TYPING[m.typing] : null,
        m.scroll ? SCROLL[m.scroll] : null,
        m.clickCentre ? "clicks land on the exact centre of the target" : null,
        m.teleports ? "the pointer jumps to targets with no path" : null,
        m.screens?.length ? `screen ${m.screens.join(" or ")}` : null,
      ].filter(Boolean)
    : [];
  const parts = [
    `${d.name} (${d.provider}), ${KIND[d.kind]}.`,
    mechanics.length ? `Input: ${mechanics.join("; ")}.` : null,
    trimNotes(d.notes),
  ];
  return parts.filter(Boolean).join(" ");
}

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export type Questions = Record<string, NoulQuestion | ChoiceQuestion>;

export function buildQuestions(drivers: readonly DriverSignature[]): Questions {
  const criteria: Record<string, string> = { [HUMAN]: HUMAN_DESCRIPTION, [UNKNOWN_AUTOMATION]: UNKNOWN_DESCRIPTION };
  // Jev allows 255 options; the registry has about 70.
  for (const d of drivers.slice(0, 250)) criteria[d.id] = describeDriver(d);
  return {
    driver: {
      type: "choice",
      instructions:
        "Which of these is operating this web session? Judge from how input arrives (pointer paths, click and key timing, " +
        "how text and scrolling arrive) and from any page signals the sensor reported. Any fact under " +
        "impossible_for_real_hardware means software is generating the input, even when its timing and pointer paths " +
        "look human. With little input to go on, keep the probability spread rather than guessing.",
      criteria,
    },
  };
}

export interface JevAnswer {
  /** Probability that an agent is driving: everything the model did not give to a person. */
  agentProbability: number;
  /** The `driver` option Jev picked. */
  choice: string;
  confidence: number | null;
  /** Strongest options first. */
  candidates: { id: string; p: number }[];
}

const prob = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null);

/** Read the `answers` object of a Jev response. Throws when it is not the shape we asked for. */
export function parseAnswers(raw: unknown): JevAnswer {
  const answers = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).answers : null;
  const a = typeof answers === "object" && answers !== null ? (answers as Record<string, Record<string, unknown> | undefined>) : null;
  const choice = a?.driver?.choice;
  const probabilities = a?.driver?.probabilities;
  if (typeof choice !== "string" || typeof probabilities !== "object" || probabilities === null) {
    throw new Error("Jev response is missing the driver answer");
  }
  const all = Object.entries(probabilities as Record<string, unknown>).map(([id, p]) => ({ id, p: prob(p) ?? 0 }));
  const person = all.find((c) => c.id === HUMAN)?.p ?? 0;
  const candidates = all
    .filter((c) => c.p > 0)
    .sort((x, y) => y.p - x.p)
    .slice(0, 5);
  return { agentProbability: round2(1 - person), choice, confidence: prob(a?.driver?.confidence), candidates };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The probability an agent is driving, from the one question asked: everything not given to a person. Answers
 * stored before the console asked one question carried a separate yes/no probability; this reads them the same way.
 */
export function agentShare(answer: JevAnswer): number {
  const person = answer.candidates.find((c) => c.id === HUMAN)?.p ?? (answer.choice === HUMAN ? 1 : 0);
  return round2(1 - person);
}

export interface JevVerdict {
  verdict: Verdict;
  tier: Tier;
  driverId: string | null;
  /** Confidence in the verdict, 0..1. */
  confidence: number;
}

/** The agent Jev named, when it picked a product and is clear about it. */
export function namedDriver(answer: JevAnswer): string | null {
  if (answer.choice === HUMAN || answer.choice === UNKNOWN_AUTOMATION) return null;
  const top = answer.candidates.find((c) => c.id === answer.choice);
  return (top?.p ?? 0) >= DRIVER_AT ? answer.choice : null;
}

/**
 * Turn the model's answer into a verdict, tier and driver. The agent probability is everything it did not give
 * to a person; an agent is called at 85% or more, and only with enough to go on (`actions`: how many actions it
 * read). A person is called at 15% or less. Anything between stays undecided, which is never treated as a person.
 */
export function toVerdict(answer: JevAnswer, actions?: number): JevVerdict {
  const p = agentShare(answer);
  const enough = actions === undefined || actions >= MIN_ACTIONS_FOR_AGENT;
  if (p >= AGENT_AT && enough) {
    const driverId = namedDriver(answer);
    return { verdict: "agent", tier: driverId ? "recognised" : "unknown-automation", driverId, confidence: p };
  }
  if (p <= HUMAN_AT) return { verdict: "human", tier: "human", driverId: null, confidence: 1 - p };
  return { verdict: "unknown", tier: "unknown", driverId: null, confidence: 0.5 };
}
