import type { RegistryIndex } from "../registry";
import type { DriverMatch, Handoff, Passport, Reason, Verdict } from "../types";
import { clamp, logistic, round } from "../util/stats";
import { RULES, type RuleDef } from "./rules";

export const AGENT_THRESHOLD = 3;
export const HUMAN_THRESHOLD = -3;
const DECISIVE_FLOOR = 8;
const CUSUM_SLACK = 0.5;
const CUSUM_TRIGGER = 4;
const DRIVER_MIN = 2;
const DRIVER_MARGIN = 1;

interface PersistentEntry {
  reason: Reason;
  /** Sensor time (ms) after which the entry stops counting. Infinity = for the life of the page. */
  until: number;
}

/**
 * Accumulates evidence into a passport.
 * Action evidence counts inside a rolling window of recent actions; page evidence (environment, artifacts)
 * counts while it is active. Decisive evidence floors the score at +8.
 */
export class Scorer {
  private actionReasons: Reason[][] = [];
  private actionScores: number[] = [];
  private persistent = new Map<string, PersistentEntry>();
  private windowStart = 0;
  private cusumUp = 0;
  private cusumDown = 0;
  private upStart = 0;
  private downStart = 0;
  private stable: Verdict = "unknown";
  readonly handoffs: Handoff[] = [];

  constructor(
    private readonly registry: RegistryIndex,
    private readonly windowActions = 12,
  ) {}

  get actions(): number {
    return this.actionScores.length;
  }

  /** Add the evidence for one action. Returns a handoff if this action completed one. */
  addAction(index: number, reasons: Reason[], t: number): Handoff | null {
    // Records can finish out of order (a typing run closes after a later click). Index by record index.
    this.actionReasons[index] = reasons;
    const x = reasons.reduce((s, r) => s + (r.decisive ? 0 : r.weight), 0);
    this.actionScores[index] = x;
    return this.updateHandoff(index, x, t);
  }

  /** Add page-level evidence. A later reason with the same key replaces the earlier one. */
  addPersistent(key: string, reason: Reason, ttlMs = Infinity): void {
    this.persistent.set(key, { reason, until: reason.t + ttlMs });
  }

  /** Let page-level evidence lapse after `graceMs` (e.g. an overlay that was removed). */
  expirePersistent(key: string, at: number, graceMs = 0): void {
    const e = this.persistent.get(key);
    if (e) e.until = Math.min(e.until, at + graceMs);
  }

  hasPersistent(key: string): boolean {
    return this.persistent.has(key);
  }

  reset(): void {
    this.actionReasons = [];
    this.actionScores = [];
    this.persistent.clear();
    this.windowStart = 0;
    this.cusumUp = this.cusumDown = 0;
    this.upStart = this.downStart = 0;
    this.stable = "unknown";
    this.handoffs.length = 0;
  }

  /** All reasons that currently count, aggregated by rule id. */
  activeReasons(t: number): Reason[] {
    const first = Math.max(this.windowStart, this.actionReasons.length - this.windowActions);
    const pool: Reason[] = [];
    for (let i = first; i < this.actionReasons.length; i++) pool.push(...(this.actionReasons[i] ?? []));
    for (const e of this.persistent.values()) if (e.until >= t) pool.push(e.reason);
    return pool;
  }

  compute(t: number): Passport {
    const pool = this.activeReasons(t);
    const byRule = new Map<string, { sum: number; count: number; reason: Reason; drivers: Record<string, number> }>();
    let decisive = false;
    for (const r of pool) {
      if (r.decisive) decisive = true;
      const def = (RULES as Record<string, RuleDef>)[r.id];
      const maxCount = def?.maxCount ?? 3;
      const agg = byRule.get(r.id) ?? { sum: 0, count: 0, reason: r, drivers: {} };
      if (agg.count < maxCount) {
        agg.sum += r.weight;
        for (const [d, w] of Object.entries(r.drivers ?? {})) agg.drivers[d] = (agg.drivers[d] ?? 0) + w;
      }
      agg.count++;
      if (Math.abs(r.weight) > Math.abs(agg.reason.weight) || r.t > agg.reason.t) agg.reason = r;
      byRule.set(r.id, agg);
    }

    let score = 0;
    const reasons: Reason[] = [];
    const driverScores: Record<string, number> = {};
    for (const [id, agg] of byRule) {
      if (decisive && agg.sum < 0) continue; // human evidence cannot outvote decisive agent evidence
      score += agg.sum;
      for (const [d, w] of Object.entries(agg.drivers)) driverScores[d] = (driverScores[d] ?? 0) + w;
      const shown: Reason = { ...agg.reason, id, weight: round(agg.sum, 2) };
      if (agg.count > 1) shown.detail = `${agg.reason.detail ? agg.reason.detail + " · " : ""}×${agg.count}`;
      reasons.push(shown);
    }
    if (decisive) score = Math.max(score, DECISIVE_FLOOR);
    score = clamp(score, -20, 20);

    const windowCount = this.actionScores.length - Math.max(this.windowStart, this.actionScores.length - this.windowActions);
    let verdict: Verdict = "unknown";
    if (decisive || (windowCount >= 2 && score >= AGENT_THRESHOLD)) verdict = "agent";
    else if (windowCount >= 2 && score <= HUMAN_THRESHOLD) verdict = "human";
    if (verdict !== "unknown") this.stable = verdict;

    const candidates = this.rankDrivers(driverScores, logistic(score));
    let driver: DriverMatch | null = null;
    if (verdict === "agent" && candidates[0]) {
      const top = candidates[0];
      const second = candidates[1]?.score ?? 0;
      if (top.score >= DRIVER_MIN && top.score - second >= DRIVER_MARGIN) driver = top;
    }

    reasons.sort((a, b) => Number(b.decisive ?? false) - Number(a.decisive ?? false) || Math.abs(b.weight) - Math.abs(a.weight));

    return {
      verdict,
      tier: verdict === "human" ? "human" : verdict === "agent" ? (driver ? "recognised" : "unknown-automation") : "unknown",
      score: round(score, 2),
      agentProbability: round(logistic(score), 3),
      driver,
      candidates: candidates.slice(0, 5),
      reasons,
      handoffs: [...this.handoffs],
      actions: this.actionScores.length,
      source: "behaviour",
      updatedAt: t,
    };
  }

  private rankDrivers(scores: Record<string, number>, agentProbability: number): DriverMatch[] {
    const entries = Object.entries(scores)
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1]);
    return entries.flatMap(([id, s], i) => {
      const sig = this.registry.byId.get(id);
      if (!sig) return [];
      const next = entries[i + 1]?.[1] ?? 0;
      return [
        {
          id,
          name: sig.name,
          provider: sig.provider,
          kind: sig.kind,
          score: round(s, 2),
          confidence: round(logistic(s - next - 1) * agentProbability, 2),
        },
      ];
    });
  }

  private updateHandoff(index: number, x: number, t: number): Handoff | null {
    this.cusumUp = Math.max(0, this.cusumUp + x - CUSUM_SLACK);
    if (this.cusumUp === 0) this.upStart = index + 1;
    this.cusumDown = Math.max(0, this.cusumDown - x - CUSUM_SLACK);
    if (this.cusumDown === 0) this.downStart = index + 1;

    if (this.cusumUp > CUSUM_TRIGGER && this.stable === "human") {
      return this.recordHandoff({ t, actionIndex: this.upStart, from: "human", to: "agent" });
    }
    if (this.cusumDown > CUSUM_TRIGGER && this.stable === "agent" && !this.hasDecisivePersistent(t)) {
      return this.recordHandoff({ t, actionIndex: this.downStart, from: "agent", to: "human" });
    }
    return null;
  }

  private recordHandoff(h: Handoff): Handoff {
    this.handoffs.push(h);
    this.windowStart = h.actionIndex;
    this.cusumUp = this.cusumDown = 0;
    this.stable = h.to;
    return h;
  }

  private hasDecisivePersistent(t: number): boolean {
    for (const e of this.persistent.values()) if (e.reason.decisive && e.until >= t) return true;
    return false;
  }
}
