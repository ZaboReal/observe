import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FORWARDED_HEADERS, GET, MAX_BODY_BYTES, POST } from "../src/route";

const SITE = "https://shop.example";
const CONSOLE = "http://console.test";

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("OBSERVE_URL", CONSOLE);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function eventsRequest(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request(`${SITE}/_observe/v1/sdk/events`, { method: "POST", body, headers, duplex: "half" } as RequestInit);
}

describe("GET /_observe/s.js", () => {
  it("serves the console's current sensor, cached 5 minutes", async () => {
    fetchMock.mockResolvedValue(new Response("window.ObserveSensor={};", { status: 200 }));
    const res = await GET(new Request(`${SITE}/_observe/s.js`), ctx("s.js"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${CONSOLE}/sensor/v1/observe.min.js`);
    expect(init.next).toEqual({ revalidate: 300 });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/javascript/);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await res.text()).toBe("window.ObserveSensor={};");
  });

  it("defaults OBSERVE_URL to the hosted console", async () => {
    vi.stubEnv("OBSERVE_URL", "");
    fetchMock.mockResolvedValue(new Response("x", { status: 200 }));
    await GET(new Request(`${SITE}/_observe/s.js`), ctx("s.js"));
    expect(fetchMock.mock.calls[0]![0]).toBe("https://observe-console-theta.vercel.app/sensor/v1/observe.min.js");
  });

  it("serves a no-op script, uncached, when the console is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const res = await GET(new Request(`${SITE}/_observe/s.js`), ctx("s.js"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/javascript/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("/* observe: unavailable */");
  });

  it("serves the no-op script when the console answers an error", async () => {
    fetchMock.mockResolvedValue(new Response("Not found", { status: 404 }));
    const res = await GET(new Request(`${SITE}/_observe/s.js`), ctx("s.js"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("/* observe: unavailable */");
  });

  it("404s anything else", async () => {
    const res = await GET(new Request(`${SITE}/_observe/other.js`), ctx("other.js"));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("works without route params by matching the URL", async () => {
    fetchMock.mockResolvedValue(new Response("x", { status: 200 }));
    const res = await GET(new Request(`${SITE}/_observe/s.js`));
    expect(res.status).toBe(200);
  });
});

describe("POST /_observe/v1/sdk/events", () => {
  const batch = JSON.stringify({ key: "pk_shop_0123456789abcdef", sessionId: "s_1", records: [] });

  it("forwards only the allowed headers, never cookies or authorization", async () => {
    fetchMock.mockResolvedValue(Response.json({ token: "v1.a.b", exp: 1 }, { status: 200 }));
    const req = eventsRequest(batch, {
      "content-type": "text/plain;charset=UTF-8",
      "user-agent": "Mozilla/5.0 Test",
      "x-vercel-ip-country": "GB",
      "signature-agent": '"https://chatgpt.com"',
      signature: "sig1=:abc:",
      "signature-input": 'sig1=("@authority");created=1',
      cookie: "session=secret",
      authorization: "Bearer user-secret",
      "x-forwarded-for": "203.0.113.7",
      "x-real-ip": "203.0.113.7",
      origin: SITE,
      referer: `${SITE}/invoices`,
      "x-observe-token": "v1.old.token",
    });
    await POST(req, ctx("v1", "sdk", "events"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${CONSOLE}/api/v1/sdk/events`);
    expect(init.method).toBe("POST");
    const sent = Object.fromEntries(new Headers(init.headers).entries());
    expect(sent).toEqual({
      "content-type": "text/plain;charset=UTF-8",
      "user-agent": "Mozilla/5.0 Test",
      // Renamed: Vercel overwrites x-vercel-ip-country on the request reaching the console.
      "x-observe-country": "GB",
      "signature-agent": '"https://chatgpt.com"',
      signature: "sig1=:abc:",
      "signature-input": 'sig1=("@authority");created=1',
    });
    expect(Object.keys(sent).sort()).toEqual([...FORWARDED_HEADERS].map((h) => (h === "x-vercel-ip-country" ? "x-observe-country" : h)).sort());
    expect(new TextDecoder().decode(init.body)).toBe(batch);
  });

  it("does not invent headers the browser did not send", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await POST(eventsRequest(batch, { "content-type": "text/plain", cookie: "a=b" }), ctx("v1", "sdk", "events"));
    const sent = Object.fromEntries(new Headers(fetchMock.mock.calls[0]![1].headers).entries());
    expect(sent).toEqual({ "content-type": "text/plain" });
  });

  it("returns the console's status and JSON (the token)", async () => {
    fetchMock.mockResolvedValue(Response.json({ token: "v1.payload.sig", exp: 1791500000000 }, { status: 200 }));
    const res = await POST(eventsRequest(batch, { "content-type": "text/plain" }), ctx("v1", "sdk", "events"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ token: "v1.payload.sig", exp: 1791500000000 });
  });

  it("passes through the console's errors", async () => {
    fetchMock.mockResolvedValue(new Response("Unknown key", { status: 403 }));
    const res = await POST(eventsRequest(batch), ctx("v1", "sdk", "events"));
    expect(res.status).toBe(403);
  });

  it("passes through a 204 from the console", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await POST(eventsRequest(batch), ctx("v1", "sdk", "events"));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("413s a body over the limit without calling the console", async () => {
    const big = "x".repeat(MAX_BODY_BYTES + 1);
    const res = await POST(eventsRequest(big), ctx("v1", "sdk", "events"));
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("413s on a large content-length before reading the body", async () => {
    const res = await POST(eventsRequest("{}", { "content-length": String(MAX_BODY_BYTES + 1) }), ctx("v1", "sdk", "events"));
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("413s a streamed body with no content-length once it passes the limit", async () => {
    const chunk = new Uint8Array(64_000);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent++ < 10) c.enqueue(chunk);
        else c.close();
      },
    });
    const res = await POST(eventsRequest(stream), ctx("v1", "sdk", "events"));
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(10); // stopped reading early
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a body exactly at the limit", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await POST(eventsRequest("x".repeat(MAX_BODY_BYTES)), ctx("v1", "sdk", "events"));
    expect(res.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers 204 when the console is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const res = await POST(eventsRequest(batch), ctx("v1", "sdk", "events"));
    expect(res.status).toBe(204);
  });

  it("answers 204 after a 2 s timeout", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    const pending = POST(eventsRequest(batch), ctx("v1", "sdk", "events"));
    await vi.advanceTimersByTimeAsync(1999);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;
    expect(res.status).toBe(204);
  });

  it("404s other paths and methods", async () => {
    expect((await POST(new Request(`${SITE}/_observe/s.js`, { method: "POST" }), ctx("s.js"))).status).toBe(404);
    expect((await POST(new Request(`${SITE}/_observe/v1/other`, { method: "POST" }), ctx("v1", "other"))).status).toBe(404);
    expect((await GET(new Request(`${SITE}/_observe/v1/sdk/events`), ctx("v1", "sdk", "events"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
