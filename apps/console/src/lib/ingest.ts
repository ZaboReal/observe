import "server-only";

import { RULES, type RuleDef } from "@observe/sensor";
import { ACTIONS, SITE_ACTIONS, registerUser } from "./catalog";
import type { BatchMeta } from "./db";
import { compactAction, type CompactAction } from "./evidence";
import { MINUTE, summarise } from "./generate";
import { resolvePassport } from "./passport";
import { HISTORY, store, type SensorRecord } from "./store";
import type { ActionDef, Robustness, Scope, SessionEvent, Tier, Verdict } from "./types";

/**
 * Ingest for `@observe/sensor` batches, posted to `{endpoint}/v1/sdk/events` (see packages/sensor/src/core/transport.ts).
 * Times inside records are milliseconds since the sensor started on that page load.
 *
 * The endpoint is public, so everything is validated and bounded: malformed records are skipped, unknown enum
 * values are dropped, strings are capped, and per-session and global sizes are limited.
 */

/** Sessions go quiet after this long without a batch. */
const IDLE = 2 * MINUTE;

const LIMITS = {
  sessions: 5_000,
  eventsPerSession: 5_000,
  pagesPerSession: 500,
  handoffsPerSession: 100,
  labelsPerSession: 200,
  observationsPerSession: 60,
  /** Recent actions kept for Jev. Older ones still count in `actionCount`. */
  actionsPerSession: 200,
  id: 128,
  path: 300,
  label: 160,
};

const VERDICTS = new Set<Verdict>(["human", "agent", "unknown"]);
const TIERS = new Set<Tier>(["human", "verified", "recognised", "unknown-automation", "unknown"]);
const ROBUSTNESS = new Set<Robustness>(["decisive", "high", "medium", "low", "situational"]);
const INPUTS = new Set(["click", "typing", "scroll", "form"] as const);
const SOURCES = new Set(["behaviour", "signature", "handshake"]);

interface Passport {
  verdict: Verdict;
  tier: Tier;
  agentProbability: number;
  driverId: string | null;
  reasons: [string, number][];
}

type Rec =
  | { type: "identify"; t: number; userId: string | null; accountId: string | null }
  | { type: "passport"; t: number; passport: Passport }
  | { type: "reason"; t: number; key: string | null; id: string; label: string; robustness?: Robustness; detail?: string; decisive: boolean; drivers: string[] }
  | { type: "action"; t: number; kind: "click" | "typing" | "scroll" | "form"; index: number; compact: CompactAction | null }
  | { type: "handoff"; t: number; actionIndex: number; from: Verdict; to: Verdict }
  | { type: "protect"; t: number; actionId: string; passport: Passport }
  /** A decision the site's server asked for (/api/v1/decide). Honoured only in batches the console itself wrote. */
  | { type: "decision"; t: number; actionId: string }
  | { type: "other"; t: number };

export interface Batch {
  sdk: string | null;
  deviceId: string;
  sessionId: string;
  pageId: string;
  page: string;
  userId: string | null;
  accountId: string | null;
  /** Ground-truth driver label on test runs (`?observe_driver=`). */
  label: string | null;
  records: Rec[];
}

// ───────────────────────── Parsing ─────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length > 0 ? v.slice(0, max) : null);
const fin = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const time = (v: unknown): number => Math.max(0, Math.min(fin(v) ?? 0, 7 * 24 * 60 * MINUTE));

function parsePassport(v: unknown): Passport | null {
  if (!isObj(v) || !VERDICTS.has(v.verdict as Verdict) || !TIERS.has(v.tier as Tier)) return null;
  if (v.source !== undefined && !SOURCES.has(v.source as string)) return null;
  const driver = isObj(v.driver) ? str(v.driver.id, LIMITS.id) : null;
  const reasons: [string, number][] = [];
  if (Array.isArray(v.reasons)) {
    for (const r of v.reasons.slice(0, 16)) {
      const id = Array.isArray(r) ? str(r[0], LIMITS.id) : null;
      const w = Array.isArray(r) ? fin(r[1]) : null;
      if (id && w !== null) reasons.push([id, w]);
    }
  }
  return {
    verdict: v.verdict as Verdict,
    tier: v.tier as Tier,
    agentProbability: Math.max(0, Math.min(1, fin(v.agentProbability) ?? 0.5)),
    driverId: driver,
    reasons,
  };
}

function parseRecord(v: unknown): Rec | null {
  if (!isObj(v)) return null;
  switch (v.type) {
    case "identify":
      return { type: "identify", t: time(v.t), userId: str(v.userId, LIMITS.id), accountId: str(v.accountId, LIMITS.id) };
    case "passport": {
      const passport = parsePassport(v.passport);
      return passport ? { type: "passport", t: time(v.t), passport } : null;
    }
    case "reason": {
      if (!isObj(v.reason)) return null;
      const id = str(v.reason.id, LIMITS.id);
      const label = str(v.reason.label, LIMITS.label);
      if (!id || !label) return null;
      const robustness = ROBUSTNESS.has(v.reason.robustness as Robustness) ? (v.reason.robustness as Robustness) : undefined;
      return {
        type: "reason",
        t: time(v.reason.t),
        key: str(v.key, LIMITS.label),
        id,
        label,
        robustness,
        detail: str(v.reason.detail, LIMITS.label) ?? undefined,
        decisive: v.reason.decisive === true,
        drivers: driverIds(v.reason.drivers),
      };
    }
    case "action": {
      if (!isObj(v.record) || !INPUTS.has(v.record.kind as never)) return null;
      const index = fin(v.record.index);
      if (index === null || index < 0) return null;
      return { type: "action", t: time(v.record.t), kind: v.record.kind as "click", index: Math.floor(index), compact: compactAction(v.record, v.reasons) };
    }
    case "handoff": {
      const h = v.handoff;
      if (!isObj(h) || !VERDICTS.has(h.from as Verdict) || !VERDICTS.has(h.to as Verdict)) return null;
      const actionIndex = fin(h.actionIndex);
      if (actionIndex === null || actionIndex < 0) return null;
      return { type: "handoff", t: time(h.t), actionIndex: Math.floor(actionIndex), from: h.from as Verdict, to: h.to as Verdict };
    }
    case "protect": {
      const actionId = str(v.actionId, LIMITS.id);
      const passport = parsePassport(v.passport);
      return actionId && passport ? { type: "protect", t: time(v.t), actionId, passport } : null;
    }
    case "decision": {
      const actionId = str(v.actionId, LIMITS.id);
      return actionId ? { type: "decision", t: time(v.t), actionId } : null;
    }
    case "start":
    case "unknown-extension":
      return { type: "other", t: time(v.t) };
    default:
      return null;
  }
}

/** `{ driverId: weight }` → driver ids, strongest first. */
function driverIds(v: unknown): string[] {
  if (!isObj(v)) return [];
  return Object.entries(v)
    .filter((e): e is [string, number] => e[0].length <= LIMITS.id && typeof e[1] === "number" && Number.isFinite(e[1]) && e[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
}

/** Validate a raw body. Returns null when it is not a sensor batch at all; bad records inside are dropped. */
export function parseBatch(v: unknown): Batch | null {
  if (!isObj(v) || !Array.isArray(v.records)) return null;
  const sessionId = str(v.sessionId, LIMITS.id);
  const pageId = str(v.pageId, LIMITS.id);
  if (!sessionId || !pageId) return null;
  const identity = isObj(v.identity) ? v.identity : {};
  const records: Rec[] = [];
  for (const r of v.records.slice(0, 2_000)) {
    const parsed = parseRecord(r);
    if (parsed) records.push(parsed);
  }
  return {
    sdk: str(v.sdk, 32),
    deviceId: str(v.deviceId, LIMITS.id) ?? "unknown",
    sessionId,
    pageId,
    page: str(v.page, LIMITS.path) ?? "/",
    userId: str(identity.userId, LIMITS.id),
    accountId: str(identity.accountId, LIMITS.id),
    label: str(v.label, LIMITS.id),
    records,
  };
}

// ───────────────────────── Ingest ─────────────────────────

/** Agents that sign their requests name themselves in `Signature-Agent`; the ones the registry knows. */
const SIGNATURE_AGENTS: [RegExp, string][] = [[/chatgpt\.com|openai\.com/i, "chatgpt-agent"]];

export function ingest(batch: Batch, now: number, meta: BatchMeta, siteId: string): void {
  evict(now);
  if (meta.server) return ingestDecisions(batch, now, siteId);
  const span = timeSpan(batch.records);
  let rec = store.sensor.get(batch.sessionId);
  if (!rec) {
    rec = {
      site: siteId,
      session: {
        id: batch.sessionId,
        userId: batch.userId ?? `device:${batch.deviceId}`,
        accountId: batch.accountId ?? "acct_unassigned",
        // The session starts at its earliest record, which after `sensor.reset()` can be long after page load.
        startedAt: now - span.max + span.min,
        endedAt: now + IDLE,
        lastAt: now,
        verdict: "unknown",
        tier: "unknown",
        driverId: null,
        confidence: 0.5,
        handoffAt: null,
        humanActions: 0,
        agentActions: 0,
        scopes: {},
        device: `Device ${batch.deviceId}`,
        source: "sensor",
        seed: 0,
      },
      events: [],
      inputs: new Map(),
      reasons: [],
      labels: new Map(),
      pages: new Map(),
      handoffs: [],
      lastSeen: now,
      sdk: batch.sdk,
      label: batch.label,
      actions: [],
      actionCount: 0,
      actionKeys: new Set(),
      observations: new Map(),
      rules: null,
      client: { ua: null, country: null, signatureAgent: null },
      jev: null,
      jevStatus: { inFlight: false, at: 0, key: "", error: null },
    };
    store.sensor.set(batch.sessionId, rec);
  }
  const s = rec.session;
  if (batch.label) rec.label = batch.label;
  applyMeta(rec, meta);
  if (batch.userId) s.userId = batch.userId;
  if (batch.accountId) s.accountId = batch.accountId;
  registerUser(s.userId, null, s.accountId);

  // Place this page load on the session's clock the first time we see it. Server time, so client clock skew does not matter.
  let anchor = rec.pages.get(batch.pageId);
  if (anchor === undefined) {
    if (rec.pages.size >= LIMITS.pagesPerSession) return;
    anchor = now - span.max;
    rec.pages.set(batch.pageId, anchor);
    push(rec, { t: Math.max(0, anchor + span.min - s.startedAt), type: "page", route: batch.page, driver: s.verdict });
  }
  const at = (t: number) => Math.max(0, anchor! + t - s.startedAt);

  for (const r of batch.records) {
    switch (r.type) {
      case "identify":
        if (r.userId) s.userId = r.userId;
        if (r.accountId) s.accountId = r.accountId;
        registerUser(s.userId, null, s.accountId);
        break;
      case "reason":
        if (rec.labels.size < LIMITS.labelsPerSession || rec.labels.has(r.id)) {
          rec.labels.set(r.id, { id: r.id, label: r.label, robustness: r.robustness, detail: r.detail });
        }
        // Keyed reasons are page-level evidence (environment, overlays, globals); a later one with the same key replaces it.
        if (r.key && (rec.observations.size < LIMITS.observationsPerSession || rec.observations.has(r.key))) {
          rec.observations.set(r.key, { id: r.id, label: r.label, detail: r.detail, robustness: r.robustness, decisive: r.decisive, drivers: r.drivers });
        }
        break;
      case "passport":
        applyPassport(rec, r.passport);
        break;
      case "action": {
        const key = `${batch.pageId}:${r.index}`;
        if (rec.actionKeys.has(key)) break;
        rec.actionKeys.add(key);
        rec.actionCount++;
        if (r.compact) {
          rec.actions.push(r.compact);
          if (rec.actions.length > LIMITS.actionsPerSession) rec.actions.shift();
        }
        const event: SessionEvent = { t: at(r.t), type: "input", input: r.kind, route: batch.page, driver: driverAt(rec, batch.pageId, r.index) };
        if (push(rec, event)) rec.inputs.set(key, event);
        break;
      }
      case "handoff":
        applyHandoff(rec, batch.pageId, r);
        break;
      case "protect":
        applyPassport(rec, r.passport);
        pushAction(rec, { t: at(r.t), type: "action", route: batch.page, action: actionFor(r.actionId, batch.page), driver: s.verdict }, "protect");
        break;
    }
  }

  resolvePassport(rec);
  Object.assign(s, summarise(rec.events));
  s.endedAt = now + IDLE;
  s.lastAt = s.startedAt + (rec.events[rec.events.length - 1]?.t ?? 0);
  rec.lastSeen = now;
}

/**
 * Decisions the site's server asked /api/v1/decide for, stored by the console as their own batch. They mark the
 * action on the session at the moment it was decided; a session this server does not know is skipped.
 */
function ingestDecisions(batch: Batch, now: number, siteId: string) {
  const rec = store.sensor.get(batch.sessionId);
  if (!rec || rec.site !== siteId) return;
  const s = rec.session;
  for (const r of batch.records) {
    if (r.type !== "decision") continue;
    pushAction(rec, { t: Math.max(0, now - s.startedAt), type: "action", route: batch.page, action: actionFor(r.actionId, batch.page), driver: s.verdict }, "decision");
  }
  Object.assign(s, summarise(rec.events));
  s.lastAt = s.startedAt + (rec.events[rec.events.length - 1]?.t ?? 0);
}

/**
 * Keep what the server saw about the request. A `Signature-Agent` header is the agent saying it signs its
 * requests (Web Bot Auth); it is recorded as page-level evidence and, for agents the registry knows, names them.
 */
function applyMeta(rec: SensorRecord, meta: BatchMeta) {
  const c = rec.client;
  if (meta.ua) c.ua = meta.ua.slice(0, 300);
  if (meta.country) c.country = meta.country.slice(0, 8);
  if (!meta.signatureAgent) return;
  c.signatureAgent = meta.signatureAgent.slice(0, LIMITS.label);
  const driver = SIGNATURE_AGENTS.find(([re]) => re.test(c.signatureAgent!))?.[1];
  rec.observations.set("server.signature-agent", {
    id: "server.signature-agent",
    label: "Request says it comes from a signed agent",
    detail: `Signature-Agent: ${c.signatureAgent}`,
    robustness: "high",
    decisive: Boolean(driver),
    drivers: driver ? [driver] : [],
  });
}

/** Append in time order. Returns false when the session is full. */
/** How far apart the page's protect record and the server's decision for one request can land, ms. */
const PAIR_WINDOW_MS = 15_000;
// Which side reported each action event, and which events already stand for a pair.
const actionSource = new WeakMap<SessionEvent, "protect" | "decision">();
const pairedEvents = new WeakSet<SessionEvent>();

/**
 * One protected request is reported twice: by the sensor (its protect record, when the page sends the request) and
 * by the site's server (the decision it asked /api/v1/decide for). Whichever arrives second pairs with the first
 * and adds nothing, so the action, and any price for it, counts once. Two real requests still count twice.
 */
function pushAction(rec: SensorRecord, e: SessionEvent, source: "protect" | "decision"): void {
  const id = e.action?.id;
  for (let i = rec.events.length - 1; i >= 0; i--) {
    const other = rec.events[i]!;
    if (other.t < e.t - PAIR_WINDOW_MS) break;
    if (other.t > e.t + PAIR_WINDOW_MS || other.type !== "action" || other.action?.id !== id) continue;
    if (pairedEvents.has(other) || actionSource.get(other) === source) continue;
    pairedEvents.add(other);
    return;
  }
  if (push(rec, e)) actionSource.set(e, source);
}

function push(rec: SensorRecord, e: SessionEvent): boolean {
  if (rec.events.length >= LIMITS.eventsPerSession) return false;
  let i = rec.events.length;
  while (i > 0 && rec.events[i - 1]!.t > e.t) i--;
  rec.events.splice(i, 0, e);
  return true;
}

/** Keep the verdict the sensor's rules reached in the browser. `resolvePassport` decides what the session shows. */
function applyPassport(rec: SensorRecord, p: Passport) {
  // Each page load restarts the sensor at "unknown". That is a lack of evidence, not a new verdict, so keep what we know.
  if (p.verdict === "unknown" && rec.rules && rec.rules.verdict !== "unknown") return;
  rec.rules = { verdict: p.verdict, tier: p.tier, agentProbability: p.agentProbability, driverId: p.verdict === "agent" ? p.driverId : null };
  rec.reasons = p.reasons.map(([id, weight]) => {
    const known = rec.labels.get(id);
    const rule = (RULES as Record<string, RuleDef>)[id];
    return {
      id,
      label: known?.label ?? rule?.label ?? labelFromId(id),
      robustness: known?.robustness ?? rule?.robustness,
      detail: known?.detail,
      weight,
      t: 0,
    };
  });
}

/**
 * The sensor sends a handoff after the actions that triggered it, and its index points back to where the
 * change began, so relabel the inputs already stored for this page.
 */
function applyHandoff(rec: SensorRecord, pageId: string, h: { actionIndex: number; from: Verdict; to: Verdict }) {
  if (rec.handoffs.length >= LIMITS.handoffsPerSession) return;
  rec.handoffs.push({ pageId, actionIndex: h.actionIndex, to: h.to });
  const prefix = `${pageId}:`;
  for (const [key, event] of rec.inputs) {
    if (!key.startsWith(prefix)) continue;
    const index = Number(key.slice(prefix.length));
    if (index >= h.actionIndex) event.driver = h.to;
    else if (event.driver === "unknown") event.driver = h.from;
  }
}

/** `pointer.teleport` → "Pointer teleport", for rule ids from a newer sensor than this console knows. */
function labelFromId(id: string): string {
  const words = id.replace(/[._-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Who drove the action at this index, given the handoffs the sensor reported for the page. */
function driverAt(rec: SensorRecord, pageId: string, index: number): Verdict {
  let driver: Verdict = rec.session.verdict;
  for (const h of rec.handoffs) if (h.pageId === pageId && index >= h.actionIndex) driver = h.to;
  return driver;
}

function timeSpan(records: Rec[]): { min: number; max: number } {
  let min = Infinity;
  let max = 0;
  for (const r of records) {
    if (r.t > max) max = r.t;
    if (r.t < min) min = r.t;
  }
  return { min: Number.isFinite(min) ? min : 0, max };
}

/** Drop sessions older than the history window, then the least recently seen ones above the cap. */
function evict(now: number) {
  for (const [id, r] of store.sensor) if (r.lastSeen < now - HISTORY) store.sensor.delete(id);
  if (store.sensor.size < LIMITS.sessions) return;
  const oldest = [...store.sensor.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  for (const [id] of oldest.slice(0, store.sensor.size - LIMITS.sessions + 1)) store.sensor.delete(id);
}

const SCOPE_HINTS: [RegExp, Scope][] = [
  [/delete|remove|destroy/, "delete"],
  [/pay|payroll|refund|payout|charge/, "pay"],
  [/sso|api.?key|role|setting|admin|billing/, "settings"],
  [/invite|share|access/, "invite"],
  [/send|email|message/, "send"],
  [/export|download|csv/, "export"],
  [/create|edit|update|save|change/, "edit"],
];

/** Map the id passed to `sensor.protect()` or /api/v1/decide onto a catalogued action, or describe it from its name. */
export function actionFor(id: string, route: string): ActionDef {
  const known = ACTIONS.find((a) => a.id === id) ?? SITE_ACTIONS.find((a) => a.id === id);
  if (known) return known;
  const scope = SCOPE_HINTS.find(([re]) => re.test(id.toLowerCase()))?.[1] ?? "view";
  const risk = scope === "delete" ? "critical" : scope === "pay" || scope === "settings" ? "high" : scope === "view" ? "low" : "medium";
  const label = id.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return { id, label, method: scope === "view" ? "GET" : "POST", path: id, route, scope, risk };
}
