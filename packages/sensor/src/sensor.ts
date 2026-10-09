import { Capture, type ActionRecord, type LabStreamEvent } from "./capture";
import { loadSession, newSession, readConsent, touchSession, writeConsent, type SessionIds } from "./core/session";
import { normaliseRules, RequestGuard } from "./core/protect";
import { Transport } from "./core/transport";
import { DebugPanel } from "./debug/panel";
import { analyzeAction } from "./detect/analyze";
import { Scorer } from "./detect/scorer";
import { ArtifactWatcher, scanKeyframes } from "./probes/artifacts";
import { ConsoleWatcher } from "./probes/console";
import { MessageWatcher } from "./probes/messages";
import { probeCss } from "./probes/presence";
import { probeAutomation, type ProbeResult } from "./probes/automation";
import { StackWatcher } from "./probes/stack";
import { DualFocusWatcher, labEnvironment, probeDebugger, probeScreen, probeSoftwareGl, ViewportShiftWatcher } from "./probes/environment";
import { WebMcpWatcher } from "./probes/webmcp";
import { buildIndex, DRIVERS, type DriverSignature, type RegistryIndex } from "./registry";
import type { Identity, Passport, ProtectedAction, ProtectedActionSnapshot, Reason, SensorConfig, SensorEvent } from "./types";
import { hasWindow, now, queryParam } from "./util/env";
import { Emitter } from "./util/emitter";
import { resetTargetOrdinals } from "./util/target";
import { VERSION } from "./version";

type State = "idle" | "held" | "running" | "stopped";

const HISTORY = 60;
const LAB_LOCAL_MAX = 20_000;
const ARTIFACT_GRACE_MS = 20_000;
/** Longest `protectAsync` waits for a collector token before resolving with `token: null`. */
const TOKEN_WAIT_MS = 1500;

function emptyPassport(t = 0): Passport {
  return {
    verdict: "unknown",
    tier: "unknown",
    score: 0,
    agentProbability: 0.5,
    driver: null,
    candidates: [],
    reasons: [],
    handoffs: [],
    actions: 0,
    source: "behaviour",
    updatedAt: t,
  };
}

/**
 * The browser sensor. Watches how the session is driven (never what is typed or shown),
 * scores it, and names the agent when it can.
 */
export class Sensor {
  readonly config: SensorConfig;
  readonly drivers: readonly DriverSignature[];
  private readonly registry: RegistryIndex;
  private session: SessionIds;
  private identity: Identity = { userId: null, accountId: null };
  private state: State = "idle";
  private readonly startedAt = now();
  private readonly startedAtWall = Date.now();
  private capture: Capture | null = null;
  private scorer: Scorer;
  private artifacts: ArtifactWatcher | null = null;
  private webmcp: WebMcpWatcher | null = null;
  private viewport: ViewportShiftWatcher | null = null;
  private messages: MessageWatcher | null = null;
  private consoleWatch: ConsoleWatcher | null = null;
  private stackWatch: StackWatcher | null = null;
  private dualFocus: DualFocusWatcher | null = null;
  private transport: Transport;
  private guard: RequestGuard | null = null;
  private panel: DebugPanel | null = null;
  private probeTimers: ReturnType<typeof setTimeout>[] = [];
  private history: ActionRecord[] = [];
  private labLocal: LabStreamEvent[] = [];
  private unknownExtensions = new Set<string>();
  private events = new Emitter<SensorEvent>();
  private passport: Passport = emptyPassport();
  private external: Passport | null = null;
  private lastKey = "";
  private lastEmitKey = "";
  readonly labDriver: string | undefined;
  readonly debug: boolean;

  constructor(config: SensorConfig = {}, drivers: readonly DriverSignature[] = DRIVERS) {
    this.config = { capture: "standard", flushIntervalMs: 5000, windowActions: 12, ...config };
    this.drivers = drivers;
    this.registry = buildIndex(drivers);
    this.session = hasWindow ? loadSession() : { deviceId: "d_ssr", sessionId: "s_ssr", pageId: "p_ssr" };
    this.scorer = new Scorer(this.registry, this.config.windowActions);
    this.labDriver = config.labDriver ?? queryParam("observe_driver") ?? undefined;
    this.debug = Boolean(config.debug) || queryParam("observe_debug") === "1";
    this.transport = new Transport({
      endpoint: config.endpoint,
      publishableKey: config.publishableKey,
      flushIntervalMs: this.config.flushIntervalMs ?? 5000,
      envelope: () => this.envelope(),
    });
  }

  /** Begin collecting. With `waitForConsent`, collection holds until `optIn()`. */
  start(): void {
    if (!hasWindow || this.state === "running" || this.state === "stopped") return;
    const consent = readConsent();
    if (consent === "denied") return;
    if (this.config.waitForConsent && consent !== "granted") {
      this.state = "held";
      return;
    }
    this.run();
  }

  /** Attach your own stable internal ids. Never send names, emails or tokens. */
  identify(identity: Partial<Identity>): void {
    this.identity = { userId: identity.userId ?? null, accountId: identity.accountId ?? null };
    this.transport.push({ type: "identify", t: this.t(), ...this.identity });
  }

  /** Subscribe to passport changes. The listener is called immediately with the current passport. */
  onPassport(fn: (p: Passport) => void): () => void {
    const off = this.events.on((e) => {
      if (e.type === "passport") fn(e.passport);
    });
    fn(this.getPassport());
    return off;
  }

  /** Subscribe to every sensor event: passports, individual reasons and handoffs. */
  on(fn: (e: SensorEvent) => void): () => void {
    return this.events.on(fn);
  }

  getPassport(): Passport {
    return this.passport;
  }

  getHistory(): readonly ActionRecord[] {
    return this.history;
  }

  get sessionId(): string {
    return this.session.sessionId;
  }

  get running(): boolean {
    return this.state === "running";
  }

  /**
   * Call right before a sensitive action. Closes open typing runs so the newest evidence counts,
   * and returns the passport to send to your backend with the action.
   */
  protect(actionId: string): ProtectedActionSnapshot {
    this.capture?.flush();
    this.recompute(true);
    const snap: ProtectedActionSnapshot = { actionId, sessionId: this.session.sessionId, passport: this.passport, t: this.t() };
    this.transport.push({ type: "protect", ...snap, passport: summarise(this.passport) });
    return snap;
  }

  /**
   * `protect`, then send the batch now and resolve once the collector's signed token is available, for your server to
   * check with `POST /api/v1/decide`. Waits at most 1.5 s (then `token: null`). A token already held is returned
   * straight away while the batch goes in the background.
   */
  async protectAsync(actionId: string): Promise<ProtectedAction> {
    const snap = this.protect(actionId);
    const held = this.transport.token();
    // Held for consent or stopped: never send. No collector: no token will come.
    if (this.state !== "running" || !this.transport.enabled) return { ...snap, token: held };
    const sent = this.transport.flush(false);
    if (held) return { ...snap, token: held };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const token = await Promise.race([
      sent.then(() => this.transport.token()),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), TOKEN_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
    return { ...snap, token };
  }

  /** The collector's latest signed session token, or `null` when none arrived yet or it has expired. */
  token(): string | null {
    return this.transport.token();
  }

  /** Apply a passport from a signed source (edge-verified Web Bot Auth or an agent handshake). */
  setPassport(p: Partial<Passport> & { source: "signature" | "handshake" }): void {
    this.external = { ...emptyPassport(this.t()), verdict: "agent", tier: "verified", agentProbability: 1, ...p };
    this.recompute(true);
  }

  /** Grant collection (from your consent manager). Starts the sensor if it was held. */
  optIn(): void {
    writeConsent("granted");
    if (this.state === "held" || this.state === "idle") this.run();
  }

  /** Withdraw consent: stop collection and discard everything not yet sent. */
  optOut(): void {
    writeConsent("denied");
    this.transport.discard();
    this.halt();
    this.state = "held";
  }

  /** Start a fresh session, e.g. on logout or account switch. */
  reset(): void {
    this.capture?.flush();
    void this.transport.flush(false);
    this.scorer.reset();
    this.history = [];
    this.labLocal = [];
    this.external = null;
    this.identity = { userId: null, accountId: null };
    this.session = { ...this.session, sessionId: newSession() };
    // The token names the old session; the next batch brings one for the new session.
    this.transport.clearToken();
    resetTargetOrdinals();
    if (this.state === "running") this.runProbes();
    this.recompute(true);
  }

  /** Stop everything and remove listeners and UI. */
  destroy(): void {
    this.halt();
    void this.transport.flush(true);
    this.transport.stop();
    this.events.clear();
    this.state = "stopped";
  }

  /** Everything the sensor holds locally, as JSON. For lab collection without a collector. */
  exportSession(): string {
    return JSON.stringify(
      {
        sdk: VERSION,
        label: this.labDriver ?? null,
        session: this.session,
        identity: this.identity,
        startedAt: this.startedAtWall,
        exportedAt: Date.now(),
        page: hasWindow ? location.pathname : null,
        passport: this.passport,
        records: this.history,
        unknownExtensions: [...this.unknownExtensions],
        lab: this.config.capture === "lab" ? this.labLocal : undefined,
      },
      null,
      1,
    );
  }

  // ───────────────────────── internals ─────────────────────────

  private t(): number {
    return now() - this.startedAt;
  }

  private run(): void {
    if (!hasWindow) return;
    this.state = "running";
    const lab = this.config.capture === "lab";
    this.capture = new Capture({
      clock: () => this.t(),
      registry: this.registry,
      onRecord: (r) => this.handleRecord(r),
      onLab: lab
        ? (e) => {
            this.transport.pushLab(e);
            this.labLocal.push(e);
            if (this.labLocal.length > LAB_LOCAL_MAX) this.labLocal.splice(0, this.labLocal.length - LAB_LOCAL_MAX);
          }
        : undefined,
      onPageChange: () => touchSession(),
      ignoreSelector: this.config.ignoreSyntheticFrom,
    });
    this.capture.start();

    this.artifacts = new ArtifactWatcher(this.registry, () => this.t(), {
      onFound: (r) => this.persist(r),
      onGone: (key) => {
        this.scorer.expirePersistent(key, this.t(), ARTIFACT_GRACE_MS);
        this.recompute();
      },
      onUnknownExtension: (id) => {
        this.unknownExtensions.add(id);
        if (lab) this.transport.push({ type: "unknown-extension", id, t: this.t() });
      },
    });
    this.artifacts.start();

    this.messages = new MessageWatcher(
      this.registry,
      () => this.t(),
      (r) => this.persist(r, 120_000),
      (extId) => this.artifacts?.extension(extId, this.t()),
    );
    this.messages.start();

    if (this.config.probes?.console !== false) {
      this.consoleWatch = new ConsoleWatcher(this.registry, () => this.t(), (r) => this.persist(r));
      this.consoleWatch.start();
    }

    if (this.config.probes?.stack !== false) {
      this.stackWatch = new StackWatcher(this.registry, () => this.t(), (r) => this.persist(r));
      this.stackWatch.start();
    }

    this.dualFocus = new DualFocusWatcher(this.session.pageId, () => this.t(), (r) => this.persist(r, 300_000));
    this.dualFocus.start();

    this.webmcp = new WebMcpWatcher(() => this.t(), (r) => this.persist(r, 60_000));
    this.webmcp.start();

    this.viewport = new ViewportShiftWatcher(() => this.t(), (r) => this.persist(r, 120_000));
    this.viewport.start();

    const rules = normaliseRules(this.config.protect);
    if (rules.length) {
      this.guard = new RequestGuard(rules, {
        protectAsync: (action) => this.protectAsync(action),
        protectNow: (action) => this.protectNow(action),
      });
      this.guard.install();
    }

    this.transport.start();
    this.runProbes();
    this.scheduleProbes();

    if (this.debug) {
      this.panel = new DebugPanel(this.labDriver, () => this.exportSession(), () => this.reset());
      const mount = () => this.panel?.mount();
      if (document.body) mount();
      else document.addEventListener("DOMContentLoaded", mount, { once: true });
    }
    this.transport.push({ type: "start", t: 0, sdk: VERSION, capture: this.config.capture, webmcp: WebMcpWatcher.supported() });
    if (lab) void labEnvironment().then((env) => this.transport.push({ type: "lab-env", t: this.t(), env }));
    this.recompute(true);
  }

  private halt(): void {
    this.capture?.stop();
    this.capture = null;
    this.artifacts?.stop();
    this.artifacts = null;
    this.webmcp?.stop();
    this.webmcp = null;
    this.viewport?.stop();
    this.viewport = null;
    this.messages?.stop();
    this.messages = null;
    this.consoleWatch?.stop();
    this.consoleWatch = null;
    this.stackWatch?.stop();
    this.stackWatch = null;
    this.dualFocus?.stop();
    this.dualFocus = null;
    this.guard?.uninstall();
    this.guard = null;
    for (const id of this.probeTimers) clearTimeout(id);
    this.probeTimers = [];
    this.panel?.unmount();
    this.panel = null;
  }

  /** For form posts and sync XHR, which can't wait: record now, send with keepalive, return the token held now. */
  private protectNow(actionId: string): string | null {
    const token = this.transport.token();
    this.protect(actionId);
    if (this.state === "running") void this.transport.flush(true);
    return token;
  }

  private scheduleProbes(): void {
    // Frameworks add globals after load (e.g. ChromeDriver on first script call), so re-check for a while.
    const at = [1000, 3000, 8000, 15000, 30000, 60000];
    for (const ms of at) this.probeTimers.push(setTimeout(() => this.runProbes(), ms));
    this.probeTimers.push(
      setTimeout(() => {
        const idle = (cb: () => void) =>
          typeof (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback === "function"
            ? (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(cb)
            : setTimeout(cb, 0);
        idle(() => {
          for (const r of [...probeSoftwareGl(this.t()), ...probeCss(this.registry, this.t())]) this.persist(r);
        });
      }, 2500),
    );
    if (this.config.probes?.debugger) {
      const tick = () => {
        for (const r of probeDebugger(this.t())) this.persist(r, 15_000);
        this.probeTimers.push(setTimeout(tick, 5000));
      };
      this.probeTimers.push(setTimeout(tick, 1500));
    }
  }

  private runProbes(): void {
    const t = this.t();
    for (const r of [...probeAutomation(this.registry, t), ...probeScreen(this.registry, t), ...scanKeyframes(this.registry, t)]) {
      if (!this.scorer.hasPersistent(r.key)) this.persist(r);
    }
  }

  private persist(r: ProbeResult, ttlMs = Infinity): void {
    this.scorer.addPersistent(r.key, r.reason, ttlMs);
    this.events.emit({ type: "reason", reason: r.reason });
    this.transport.push({ type: "reason", key: r.key, reason: r.reason });
    this.recompute();
  }

  private handleRecord(rec: ActionRecord): void {
    const reasons = analyzeAction(rec, this.history, this.drivers);
    this.history.push(rec);
    if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY);
    const handoff = this.scorer.addAction(rec.index, reasons, this.t());
    for (const reason of reasons) this.events.emit({ type: "reason", reason });
    this.transport.push({ type: "action", record: rec, reasons: reasons.map((r) => [r.id, r.weight]) });
    if (handoff) {
      this.events.emit({ type: "handoff", handoff });
      this.transport.push({ type: "handoff", handoff });
    }
    touchSession();
    this.recompute();
  }

  private recompute(force = false): void {
    const t = this.t();
    let p = this.scorer.compute(t);
    if (this.external) {
      p = {
        ...p,
        verdict: "agent",
        tier: "verified",
        source: this.external.source,
        driver: this.external.driver ?? p.driver,
        agentProbability: 1,
        reasons: [...this.external.reasons, ...p.reasons],
      };
    }
    this.passport = p;
    const key = `${p.verdict}|${p.tier}|${p.driver?.id ?? ""}|${p.handoffs.length}`;
    const changed = key !== this.lastKey;
    if (changed) {
      this.lastKey = key;
      this.transport.push({ type: "passport", t, passport: summarise(p) });
    }
    const emitKey = `${key}|${p.score}|${p.actions}|${p.reasons.length}`;
    if (changed || force || emitKey !== this.lastEmitKey) {
      this.lastEmitKey = emitKey;
      this.events.emit({ type: "passport", passport: p });
    }
    this.panel?.update(p);
  }

  private envelope(): Record<string, unknown> {
    return {
      key: this.config.publishableKey ?? null,
      sdk: VERSION,
      deviceId: this.session.deviceId,
      sessionId: this.session.sessionId,
      pageId: this.session.pageId,
      page: hasWindow ? location.pathname : null,
      label: this.labDriver ?? null,
      identity: this.identity,
      capture: this.config.capture,
    };
  }
}

/** Compact passport for the wire: drops long reason details. */
function summarise(p: Passport): Record<string, unknown> {
  return {
    verdict: p.verdict,
    tier: p.tier,
    score: p.score,
    agentProbability: p.agentProbability,
    driver: p.driver ? { id: p.driver.id, confidence: p.driver.confidence } : null,
    reasons: p.reasons.slice(0, 8).map((r: Reason) => [r.id, r.weight]),
    handoffs: p.handoffs.length,
    actions: p.actions,
    source: p.source,
  };
}
