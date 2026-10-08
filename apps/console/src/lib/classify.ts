import "server-only";

import { DRIVERS } from "@observe/sensor";
import { getDriver } from "./catalog";
import { buildEvidence } from "./evidence";
import { jevConfigured, systemOne } from "./jev";
import { buildQuestions, parseAnswers, type Questions } from "./jev-questions";
import { resolvePassport } from "./passport";
import { store, type SensorRecord } from "./store";

/**
 * Asks Jev who is driving each sensor session. Runs after a batch is ingested, off the request path:
 * at most one request per session at a time, only when new evidence arrived, and no more often than
 * every few seconds per session.
 */

const MIN_INTERVAL_MS = 3_000;
const MAX_IN_FLIGHT = 8;
/** Below this, behaviour says little; page signals alone are still worth asking about. */
const MIN_ACTIONS = 2;

let questions: Questions | null = null;
let inFlight = 0;
const retries = new Map<string, ReturnType<typeof setTimeout>>();

/** Changes whenever the session has new evidence for Jev. */
function fingerprint(rec: SensorRecord): string {
  return `${rec.actionCount}|${rec.observations.size}`;
}

/** The state Jev reads for a session. Also shown on the check report. */
export function evidenceFor(rec: SensorRecord): Record<string, unknown> {
  const pages = new Set(rec.events.filter((e) => e.type === "page").map((e) => e.route));
  return buildEvidence(
    { actions: rec.actions, actionCount: rec.actionCount, observations: rec.observations.values(), pages },
    (id) => getDriver(id)?.name ?? id,
  );
}

function retry(id: string, ms: number) {
  if (retries.has(id)) return;
  retries.set(
    id,
    setTimeout(() => {
      retries.delete(id);
      void classifyIfDue(id);
    }, ms),
  );
}

export async function classifyIfDue(id: string): Promise<void> {
  if (!jevConfigured()) return;
  const rec = store.sensor.get(id);
  if (!rec) return;
  const status = rec.jevStatus;
  const key = fingerprint(rec);
  if (status.inFlight || key === status.key) return;
  if (rec.actionCount < MIN_ACTIONS && rec.observations.size === 0) return;
  const wait = status.at + MIN_INTERVAL_MS - Date.now();
  if (wait > 0 || inFlight >= MAX_IN_FLIGHT) return retry(id, Math.max(wait, 500));

  status.inFlight = true;
  inFlight++;
  const seen = rec.actionCount;
  try {
    const res = await systemOne(evidenceFor(rec), (questions ??= buildQuestions(DRIVERS)));
    rec.jev = { ...parseAnswers(res.raw), at: Date.now(), model: res.model, latencyMs: res.latencyMs, inputTokens: res.inputTokens, actionsSeen: seen };
    status.key = key;
    status.error = null;
  } catch (e) {
    // Leave the fingerprint alone so the next batch tries again; the rules' verdict stands meanwhile.
    status.error = e instanceof Error ? e.message : String(e);
  } finally {
    status.inFlight = false;
    status.at = Date.now();
    inFlight--;
    resolvePassport(rec);
  }
  // Evidence that arrived while Jev was answering gets its own pass.
  if (!status.error && fingerprint(rec) !== status.key) retry(id, MIN_INTERVAL_MS);
}
