import "server-only";

import type { CompactAction, Observation } from "./evidence";
import { DAY, MINUTE, buildEvents, sessionsInMinute, summarise } from "./generate";
import type { JevAnswer } from "./jev-questions";
import { defaultSite, siteById } from "./site";
import type { Reason, Session, SessionEvent, Tier, Verdict } from "./types";

/** The verdict the sensor's own rules reached in the browser. */
export interface RulesPassport {
  verdict: Verdict;
  tier: Tier;
  agentProbability: number;
  driverId: string | null;
}

/** Jev's latest answer for a session. */
export interface JevResult extends JevAnswer {
  at: number;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  /** Actions the session had when Jev was asked. */
  actionsSeen: number;
}

/** How far back the demo generator fills in history. */
export const HISTORY = 7 * DAY;

/** Everything held for a session the sensor reported. */
export interface SensorRecord {
  /** The site it was reported from (see site.ts). */
  site: string;
  session: Session;
  events: SessionEvent[];
  /** Input events by `pageId:actionIndex`, so a late handoff can relabel them. */
  inputs: Map<string, SessionEvent>;
  reasons: Reason[];
  /** Labels from `reason` records, so passport reason pairs can be shown in words. */
  labels: Map<string, Omit<Reason, "weight" | "t">>;
  /** Wall-clock start of each page load, to place the sensor's page-relative times. */
  pages: Map<string, number>;
  /** Handoff points as action indexes into this page's actions. */
  handoffs: { pageId: string; actionIndex: number; to: Session["verdict"] }[];
  lastSeen: number;
  sdk: string | null;
  /** Ground-truth label from `?observe_driver=` on test runs. */
  label: string | null;
  /** The most recent action records, compacted, for Jev. */
  actions: CompactAction[];
  /** Every action seen, including ones dropped from `actions`. */
  actionCount: number;
  /** `pageId:index` of every action stored, so a resent batch is not counted twice. */
  actionKeys: Set<string>;
  /** Page-level evidence by the sensor's reason key. */
  observations: Map<string, Observation>;
  rules: RulesPassport | null;
  /** What the server saw on the requests that carried the batches (latest wins). */
  client: { ua: string | null; country: string | null; signatureAgent: string | null };
  jev: JevResult | null;
  jevStatus: { inFlight: boolean; at: number; key: string; error: string | null };
}

/**
 * In-memory store: cached demo sessions per minute plus sessions reported by the sensor.
 * Lives on `globalThis` so dev-server reloads keep it.
 */
class Store {
  private minutes = new Map<number, Session[]>();
  private byId = new Map<string, Session>();

  constructor(readonly sensor: Map<string, SensorRecord>) {}

  private minute(bucket: number): Session[] {
    let list = this.minutes.get(bucket);
    if (!list) {
      list = sessionsInMinute(bucket);
      this.minutes.set(bucket, list);
      for (const s of list) this.byId.set(s.id, s);
    }
    return list;
  }

  private evict(now: number) {
    const oldest = Math.floor((now - HISTORY - DAY) / MINUTE);
    for (const [bucket, list] of this.minutes) {
      if (bucket >= oldest) continue;
      for (const s of list) this.byId.delete(s.id);
      this.minutes.delete(bucket);
    }
  }

  /** One site's sessions that started in [from, to], as they stand at `now`. Oldest first. */
  sessions(from: number, to: number, now: number, siteId: string = defaultSite().id): Session[] {
    this.evict(now);
    const out: Session[] = [];
    const end = Math.min(to, now);
    const demo = siteById(siteId)?.demo ?? false;
    for (let b = Math.floor(from / MINUTE); demo && b <= Math.floor(end / MINUTE); b++) {
      for (const s of this.minute(b)) {
        if (s.startedAt < from || s.startedAt > end) continue;
        out.push(s.endedAt > now ? cutAt(s, now) : s);
      }
    }
    for (const r of this.sensor.values()) {
      if (r.site === siteId && r.session.startedAt >= from && r.session.startedAt <= end) out.push(r.session);
    }
    return out.sort((a, b) => a.startedAt - b.startedAt);
  }

  /** A session of this site by id. */
  session(id: string, now: number, siteId: string = defaultSite().id): Session | undefined {
    const sensor = this.sensor.get(id);
    if (sensor) return sensor.site === siteId ? sensor.session : undefined;
    if (!siteById(siteId)?.demo) return undefined;
    let s = this.byId.get(id);
    if (!s) {
      // Not cached yet: fill the history window once, then look again.
      this.sessions(now - HISTORY, now, now, siteId);
      s = this.byId.get(id);
    }
    if (!s || s.startedAt > now) return undefined;
    return s.endedAt > now ? cutAt(s, now) : s;
  }

  events(session: Session, now: number): SessionEvent[] {
    if (session.source === "sensor") return this.sensor.get(session.id)?.events ?? [];
    // Rebuild from the cached plan: a live session's copy has its verdict and driver rewritten by `cutAt`.
    const plan = this.byId.get(session.id) ?? session;
    return buildEvents(plan).filter((e) => plan.startedAt + e.t <= now);
  }

  /** The most recent time the sensor sent anything for a site, for the setup page. */
  lastSensorEvent(siteId: string = defaultSite().id): number | null {
    let last: number | null = null;
    for (const r of this.sensor.values()) if (r.site === siteId) last = Math.max(last ?? 0, r.lastSeen);
    return last;
  }
}

/** A live session as it stands at `now`: only the events that have happened so far. */
function cutAt(session: Session, now: number): Session {
  const events = buildEvents(session).filter((e) => session.startedAt + e.t <= now);
  const counts = summarise(events);
  const agentYet = events.some((e) => e.driver === "agent");
  return {
    ...session,
    ...counts,
    lastAt: session.startedAt + (events[events.length - 1]?.t ?? 0),
    // Before the agent takes over, the session still reads as human.
    verdict: session.verdict === "agent" && !agentYet ? "human" : session.verdict,
    tier: session.verdict === "agent" && !agentYet ? "human" : session.tier,
    driverId: agentYet ? session.driverId : null,
  };
}

/** Bump when the demo generator changes, so a running dev server drops demo sessions cached by the old one. */
const DATA_VERSION = 10;

// Sensor data is kept apart from the demo cache so a version bump or hot reload never drops what the sensor sent.
const g = globalThis as unknown as { __observeSensor?: Map<string, SensorRecord>; __observeStore?: { version: number; store: Store } };
g.__observeSensor ??= new Map();
if (g.__observeStore?.version !== DATA_VERSION) g.__observeStore = { version: DATA_VERSION, store: new Store(g.__observeSensor) };
export const store = g.__observeStore.store;
