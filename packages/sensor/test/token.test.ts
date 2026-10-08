import { Sensor } from "../src/sensor";

// Collector replies: a signed token (current collectors), 204 with no body (older ones), or nothing at all.
type Reply = { kind: "token"; token?: string; exp?: number | null } | { kind: "204" } | { kind: "hang" } | { kind: "fail" };

function collector(reply: Reply = { kind: "token" }) {
  const state = { reply, sent: [] as { url: string; init: RequestInit }[] };
  const fn = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    state.sent.push({ url: String(input), init });
    const r = state.reply;
    if (r.kind === "hang") return new Promise<Response>(() => {});
    if (r.kind === "fail") return Promise.reject(new TypeError("network"));
    if (r.kind === "204") return Promise.resolve(new Response(null, { status: 204 }));
    const body: Record<string, unknown> = { token: r.token ?? "v1.payload.sig" };
    if (r.exp !== null) body.exp = r.exp ?? Date.now() + 30 * 60_000;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  });
  window.fetch = fn as unknown as typeof fetch;
  return state;
}

const flush = (s: Sensor, unloading = false) =>
  (s as unknown as { transport: { flush: (u: boolean) => Promise<void> } }).transport.flush(unloading);
const queued = (s: Sensor) => (s as unknown as { transport: { queue: unknown[] } }).transport.queue;

const realFetch = window.fetch;
let sensors: Sensor[] = [];
function sensor(config: ConstructorParameters<typeof Sensor>[0] = {}): Sensor {
  const s = new Sensor({ endpoint: "https://collector.example", publishableKey: "pk_test", flushIntervalMs: 60_000, ...config });
  sensors.push(s);
  s.start();
  return s;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  for (const s of sensors) s.destroy();
  sensors = [];
  window.fetch = realFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("collector token", () => {
  it("keeps the token from a 200 JSON reply until it expires", async () => {
    vi.useFakeTimers();
    collector({ kind: "token", token: "v1.abc.def", exp: Date.now() + 60_000 });
    const s = sensor();
    expect(s.token()).toBeNull();
    await flush(s);
    expect(s.token()).toBe("v1.abc.def");
    vi.setSystemTime(Date.now() + 59_000);
    expect(s.token()).toBe("v1.abc.def");
    vi.setSystemTime(Date.now() + 2_000);
    expect(s.token()).toBeNull();
  });

  it("handles a 204 from an older collector: no token, nothing re-sent", async () => {
    const c = collector({ kind: "204" });
    const s = sensor();
    await flush(s);
    expect(c.sent).toHaveLength(1);
    expect(s.token()).toBeNull();
    expect(queued(s)).toHaveLength(0);
  });

  it("keeps the previous token when a later reply has none", async () => {
    const c = collector({ kind: "token", token: "v1.first.sig" });
    const s = sensor();
    await flush(s);
    c.reply = { kind: "204" };
    s.identify({ userId: "u1" });
    await flush(s);
    expect(s.token()).toBe("v1.first.sig");
  });

  it("measures expiry on the local clock, so a skewed device clock keeps fresh tokens", async () => {
    vi.useFakeTimers();
    // Device clock three hours ahead of the server: `exp` already looks past.
    collector({ kind: "token", token: "v1.skew.sig", exp: Date.now() - 3 * 3600_000 });
    const s = sensor();
    await flush(s);
    expect(s.token()).toBe("v1.skew.sig");
    vi.setSystemTime(Date.now() + 31 * 60_000);
    expect(s.token()).toBeNull();
  });

  it("ignores malformed replies", async () => {
    window.fetch = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    const s = sensor();
    await flush(s);
    expect(s.token()).toBeNull();
    expect(queued(s)).toHaveLength(0);
  });

  it("drops the token on reset, including one still in flight for the old session", async () => {
    collector({ kind: "token", token: "v1.old.sig" });
    const s = sensor();
    await flush(s);
    expect(s.token()).toBe("v1.old.sig");
    let release!: () => void;
    window.fetch = vi.fn(
      () => new Promise<Response>((r) => (release = () => r(new Response(JSON.stringify({ token: "v1.late.sig", exp: Date.now() + 60_000 }), { status: 200 })))),
    ) as unknown as typeof fetch;
    s.identify({ userId: "u1" });
    const inFlight = flush(s);
    s.reset();
    expect(s.token()).toBeNull();
    release();
    await inFlight;
    expect(s.token()).toBeNull();
  });

  it("puts records back after a network failure and sends them next time", async () => {
    const c = collector({ kind: "fail" });
    const s = sensor();
    s.identify({ userId: "u1" });
    await flush(s);
    expect(queued(s).length).toBeGreaterThan(0);
    c.reply = { kind: "token" };
    await flush(s);
    const body = JSON.parse(String(c.sent.at(-1)!.init.body));
    expect(body.records.some((r: { type: string }) => r.type === "identify")).toBe(true);
    expect(s.token()).toBe("v1.payload.sig");
  });
});

describe("unload path", () => {
  it("flushes on pagehide with fetch keepalive and credentials omit, never sendBeacon", async () => {
    const c = collector();
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
    const s = sensor();
    s.identify({ userId: "u1" });
    window.dispatchEvent(new Event("pagehide"));
    await Promise.resolve();
    expect(beacon).not.toHaveBeenCalled();
    expect(c.sent).toHaveLength(1);
    const { url, init } = c.sent[0]!;
    expect(url).toBe("https://collector.example/v1/sdk/events");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe("omit");
    expect(init.headers).toEqual({ "Content-Type": "text/plain" });
    // destroy() also flushes with keepalive, still without sendBeacon.
    s.identify({ userId: "u2" });
    s.destroy();
    expect(beacon).not.toHaveBeenCalled();
    expect(c.sent.at(-1)!.init.keepalive).toBe(true);
    delete (navigator as { sendBeacon?: unknown }).sendBeacon;
  });

  it("keeps an unload batch (records and lab events together) under the 64 KB keepalive limit", async () => {
    const c = collector();
    const s = sensor({ capture: "lab" });
    const t = (s as unknown as { transport: { push: (r: unknown) => void; pushLab: (e: unknown) => void } }).transport;
    for (let i = 0; i < 1500; i++) t.push({ type: "pad", i, pad: "x".repeat(60) });
    for (let i = 0; i < 1500; i++) t.pushLab({ k: "m", i, pad: "y".repeat(60) });
    await flush(s, true);
    const body = String(c.sent[0]!.init.body);
    expect(new TextEncoder().encode(body).length).toBeLessThan(64 * 1024);
    expect(c.sent[0]!.init.keepalive).toBe(true);
    // The rest waits for the next batch.
    expect(queued(s).length).toBeGreaterThan(0);
  });
});

describe("protectAsync", () => {
  it("records the action, flushes, and resolves with the token", async () => {
    const c = collector({ kind: "token", token: "v1.fresh.sig" });
    const s = sensor();
    const r = await s.protectAsync("export_invoices");
    expect(r.actionId).toBe("export_invoices");
    expect(r.sessionId).toBe(s.sessionId);
    expect(r.passport).toBe(s.getPassport());
    expect(r.token).toBe("v1.fresh.sig");
    const body = JSON.parse(String(c.sent[0]!.init.body));
    expect(body.records.some((x: { type: string; actionId?: string }) => x.type === "protect" && x.actionId === "export_invoices")).toBe(true);
  });

  it("resolves with token null after 1.5 s when the collector does not answer", async () => {
    vi.useFakeTimers();
    collector({ kind: "hang" });
    const s = sensor();
    let done: { token: string | null } | null = null;
    const p = s.protectAsync("export_invoices").then((r) => (done = r));
    await vi.advanceTimersByTimeAsync(1400);
    expect(done).toBeNull();
    await vi.advanceTimersByTimeAsync(100);
    expect((await p).token).toBeNull();
  });

  it("resolves at once with a token already held, still sending the protect record", async () => {
    vi.useFakeTimers();
    const c = collector({ kind: "token", token: "v1.held.sig" });
    const s = sensor();
    await flush(s);
    c.reply = { kind: "hang" };
    let resolved = false;
    const p = s.protectAsync("delete_workspace").then((r) => {
      resolved = true;
      return r;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(true);
    expect((await p).token).toBe("v1.held.sig");
    expect(String(c.sent.at(-1)!.init.body)).toContain("delete_workspace");
  });

  it("resolves at once with null when there is no collector or a 204 reply", async () => {
    const local = new Sensor();
    sensors.push(local);
    local.start();
    expect((await local.protectAsync("x")).token).toBeNull();
    collector({ kind: "204" });
    const s = sensor();
    expect((await s.protectAsync("x")).token).toBeNull();
  });

  it("sends nothing while collection is held for consent", async () => {
    const c = collector();
    const s = sensor({ waitForConsent: true });
    const r = await s.protectAsync("x");
    expect(r.token).toBeNull();
    expect(c.sent).toHaveLength(0);
  });
});
