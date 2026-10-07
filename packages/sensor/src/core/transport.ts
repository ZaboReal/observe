/** Batches records and sends them to the collector. Does nothing when no endpoint is configured. */

export interface TransportOptions {
  endpoint: string | undefined;
  /** Kept for callers; the key is sent in the envelope, not as a header. */
  publishableKey: string | undefined;
  flushIntervalMs: number;
  /** Envelope fields sent with every batch. */
  envelope: () => Record<string, unknown>;
}

const MAX_BATCH_BYTES = 60_000;
const MAX_QUEUE = 2_000;
const MAX_LAB_EVENTS = 20_000;

export class Transport {
  private queue: unknown[] = [];
  private lab: unknown[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private seq = 0;
  private onPageHide = () => this.flush(true);

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
  }

  async flush(beacon: boolean): Promise<void> {
    if (!this.enabled || (this.queue.length === 0 && this.lab.length === 0)) return;
    const records = this.take(this.queue);
    const lab = this.take(this.lab);
    const body = JSON.stringify({ v: 1, seq: this.seq++, sentAt: Date.now(), ...this.opts.envelope(), records, lab });
    const url = `${this.opts.endpoint!.replace(/\/$/, "")}/v1/sdk/events`;
    if (beacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        if (navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }))) return;
      } catch {
        /* fall through to fetch */
      }
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        // A simple request (text/plain, no custom headers) skips the CORS preflight. The key travels in the body.
        headers: { "Content-Type": "text/plain" },
        body,
        keepalive: body.length < 60_000,
        credentials: "omit",
      });
      if (!res.ok && res.status >= 500) throw new Error(String(res.status));
      this.failures = 0;
    } catch {
      // Put the records back once, then give up so a dead collector cannot grow memory forever.
      this.failures++;
      if (this.failures <= 3) {
        this.queue.unshift(...records);
        this.lab.unshift(...lab);
      }
    }
  }

  private take(list: unknown[]): unknown[] {
    const out: unknown[] = [];
    let bytes = 0;
    while (list.length) {
      const size = JSON.stringify(list[0]).length;
      if (out.length && bytes + size > MAX_BATCH_BYTES) break;
      out.push(list.shift());
      bytes += size;
    }
    return out;
  }
}
