import "server-only";

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { exactMatch } from "./passport";
import type { SensorRecord } from "./store";

/**
 * Test runs (sessions with a ground-truth label from `?observe_driver=`) are written to disk as their verdict
 * changes, so results survive a console restart. Ordinary sessions are never written. The file is append-only
 * JSON lines; the last line for a session is its latest state.
 */

const FILE = process.env.OBSERVE_RESULTS_FILE || path.join(process.cwd(), ".data", "test-runs.jsonl");

/** What the console knows about a sensor session's verdict, as the API and the results file show it. */
export function summarise(rec: SensorRecord) {
  return {
    id: rec.session.id,
    label: rec.label,
    startedAt: rec.session.startedAt,
    lastSeen: rec.lastSeen,
    actions: rec.actionCount,
    decision: {
      verdict: rec.session.verdict,
      tier: rec.session.tier,
      driverId: rec.session.driverId,
      confidence: rec.session.confidence,
      decidedBy: rec.session.decidedBy ?? null,
    },
    exactMatch: exactMatch(rec),
    /** Page-level evidence the sensor reported, with the agents each points at. */
    signals: [...rec.observations.values()].map((o) => ({ id: o.id, label: o.label, decisive: o.decisive, drivers: o.drivers })),
    jev: rec.jev,
    jevPending: rec.jevStatus.inFlight || (rec.jevStatus.key !== `${rec.actionCount}|${rec.observations.size}` && !rec.jevStatus.error),
    jevError: rec.jevStatus.error,
    rules: rec.rules,
  };
}

export type SessionSummary = ReturnType<typeof summarise>;

const lastSaved = new Map<string, string>();
let ready: Promise<unknown> | null = null;

/** Append the session's state if it is a labelled test run and changed since the last write. */
export async function saveResult(rec: SensorRecord): Promise<void> {
  if (!rec.label) return;
  const s = summarise(rec);
  const key = JSON.stringify([s.actions, s.decision, s.jev?.at ?? null, s.jevError, s.exactMatch?.label ?? null]);
  if (lastSaved.get(s.id) === key) return;
  lastSaved.set(s.id, key);
  try {
    ready ??= mkdir(path.dirname(FILE), { recursive: true });
    await ready;
    await appendFile(FILE, `${JSON.stringify({ ...s, savedAt: Date.now() })}\n`);
  } catch (e) {
    lastSaved.delete(s.id);
    console.error("[observe] could not save test-run result:", e instanceof Error ? e.message : e);
  }
}

/** Latest saved state of each test run that started at or after `since`. */
export async function loadResults(since = 0): Promise<SessionSummary[]> {
  let text: string;
  try {
    text = await readFile(FILE, "utf8");
  } catch {
    return [];
  }
  const latest = new Map<string, SessionSummary>();
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const s = JSON.parse(line) as SessionSummary;
      if (s.startedAt >= since) latest.set(s.id, s);
    } catch {
      // A line cut short by a crash; skip it.
    }
  }
  return [...latest.values()];
}
