/**
 * Batches records and sends them to the collector. Does nothing when no endpoint is configured.
 *
 * Batches go with `fetch(..., { credentials: "omit" })`, never `sendBeacon` (which always sends cookies). The collector
 * answers `200 {"token", "exp"}` with a signed, short-lived session token for the customer's server; older collectors
 * answer `204` with no body.
 */

export interface TransportOptions {
  endpoint: string | undefined;
  /** Kept for callers; the key is sent in the envelope, not as a header. */
  publishableKey: string | undefined;
  flushIntervalMs: number;
  /** Envelope fields sent with every batch. */
  envelope: () => Record<string, unknown>;
}

/** Records (and, separately, lab events) per batch. On unload the two share it: keepalive bodies are capped at 64 KB. */
const MAX_BATCH_BYTES = 60_000;
const MAX_QUEUE = 2_000;
const MAX_LAB_EVENTS = 20_000;
/** Token lifetime the collector promises. Also the cap on how long a token is kept by the local clock. */
const TOKEN_TTL_MS = 30 * 60_000;

/**
 * Set while the transport calls `fetch`, so the sensor's own request wrappers pass collector traffic straight through
 * (the collector usually sits on the site's own origin, under a path a broad protect rule could match).
 */
export const bypass = { depth: 0 };

export class Transport {
  private queue: unknown[] = [];
  private lab: unknown[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private seq = 0;
  private held: { value: string; exp: number } | null = null;
  /** Bumped by `clearToken`, so a response to a batch sent before a reset can't install the old session's token. */
  private generation = 0;
  private onPageHide = () => void this.flush(true);

  constructor(private readonly opts: TransportOptions) {}

  get enabled(): boolean {
    return Boolean(this.opts.endpoint);
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => void this.flush(false), this.opts.flushIntervalMs);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onPageHide);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onPageHide);
  }

  push(record: unknown): void {
    if (!this.enabled) return;
    this.queue.push(record);
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
  }

  pushLab(event: unknown): void {
    if (!this.enabled) return;
    this.lab.push(event);
    if (this.lab.length > MAX_LAB_EVENTS) this.lab.splice(0, this.lab.length - MAX_LAB_EVENTS);
  }

  discard(): void {
    this.queue = [];
    this.lab = [];
    this.clearToken();
  }

  /** The latest collector token, or `null` when none arrived yet or it has expired. */
  token(): string | null {
    const t = this.held;
    if (!t) return null;
    if (Date.now() >= t.exp) {
      this.held = null;
      return null;
    }
    return t.value;
  }

  /** Forget the token (new session or opt-out). Responses to batches already in flight are ignored. */
  clearToken(): void {
    this.held = null;
    this.generation++;
  }

  /**
   * Send one batch. With `unloading` (pagehide, destroy, a form submission) the request is `keepalive` and the whole
   * body stays under the 64 KB keepalive limit. Resolves once the response is handled; never rejects.
   */
  async flush(unloading: boolean): Promise<void> {
    if (!this.enabled || (this.queue.length === 0 && this.lab.length === 0)) return;
    const [records, recordBytes] = this.take(this.queue, MAX_BATCH_BYTES, true);
    const [lab] = this.take(this.lab, unloading ? MAX_BATCH_BYTES - recordBytes : MAX_BATCH_BYTES, !unloading);
    const body = JSON.stringify({ v: 1, seq: this.seq++, sentAt: Date.now(), ...this.opts.envelope(), records, lab });
    const url = `${this.opts.endpoint!.replace(/\/$/, "")}/v1/sdk/events`;
    const generation = this.generation;
    try {
      let pending: Promise<Response>;
      bypass.depth++;
      try {
        pending = fetch(url, {
          method: "POST",
          // A simple request (text/plain, no custom headers) skips the CORS preflight. The key travels in the body.
          headers: { "Content-Type": "text/plain" },
          body,
          keepalive: unloading || body.length < MAX_BATCH_BYTES,
          credentials: "omit",
        });
      } finally {
        bypass.depth--;
      }
      const res = await pending;
      if (!res.ok && res.status >= 500) throw new Error(String(res.status));
      this.failures = 0;
      if (res.ok && res.status !== 204) await this.readToken(res, generation);
    } catch {
      // Put the records back once, then give up so a dead collector cannot grow memory forever.
      this.failures++;
      if (this.failures <= 3) {
        this.queue.unshift(...records);
        this.lab.unshift(...lab);
      }
    }
  }

  private async readToken(res: Response, generation: number): Promise<void> {
    let data: { token?: unknown; exp?: unknown };
    try {
      data = JSON.parse(await res.text());
    } catch {
      return;
    }
    if (generation !== this.generation || !data || typeof data.token !== "string" || !data.token) return;
    // Count the lifetime on the local clock from arrival, so a device clock that is off by hours neither throws fresh
    // tokens away nor keeps old ones forever. A token the server already considers expired is only ever reported as
    // `expired` by decide, the same outcome as no token.
    const at = Date.now();
    let ttl = typeof data.exp === "number" && isFinite(data.exp) ? data.exp - at : TOKEN_TTL_MS;
    if (!(ttl > 0) || ttl > TOKEN_TTL_MS) ttl = TOKEN_TTL_MS;
    this.held = { value: data.token, exp: at + ttl };
  }

  /**
   * Take items from the front of `list` up to `budget` bytes (JSON length plus a separator each).
   * With `force`, one oversized item still goes alone so it can't block the queue.
   */
  private take(list: unknown[], budget: number, force: boolean): [unknown[], number] {
    const out: unknown[] = [];
    let bytes = 0;
    while (list.length) {
      const size = JSON.stringify(list[0]).length + 1;
      if (bytes + size > budget && (out.length || !force)) break;
      out.push(list.shift());
      bytes += size;
    }
    return [out, bytes];
  }
}
