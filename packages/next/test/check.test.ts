import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkObserve, resetWarning } from "../src/check";
import type { ObserveDecision } from "../src/types";

const CONSOLE = "http://console.test";
const SECRET = "sk_shop_0123456789abcdef0123456789abcdef";

const DECISION: ObserveDecision = {
  mode: "observe",
  sessionId: "s_abc",
  verdict: "agent",
  tier: "recognised",
  driver: { id: "claude-in-chrome", name: "Claude in Chrome", provider: "Anthropic" },
  confidence: 0.97,
  decidedBy: "exact-match",
  outcome: "request_access",
  wouldBlock: false,
  policy: "default/export-needs-approval",
  token: "valid",
};

let fetchMock: ReturnType<typeof vi.fn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("OBSERVE_URL", CONSOLE);
  vi.stubEnv("OBSERVE_SECRET_KEY", SECRET);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  resetWarning();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  warn.mockRestore();
});

const protectedRequest = (token?: string) =>
  new Request("https://shop.example/api/invoices/export?x=1", {
    method: "POST",
    headers: token ? { "x-observe-token": token, cookie: "session=secret" } : {},
  });

describe("checkObserve", () => {
  it("sends the bearer key, token, action, method and path, and passes through a 200 decision", async () => {
    fetchMock.mockResolvedValue(Response.json(DECISION));
    const d = await checkObserve("export_invoices", { request: protectedRequest("v1.payload.sig") });

    expect(d).toEqual(DECISION);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${CONSOLE}/api/v1/decide`);
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${SECRET}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("cookie")).toBeNull();
    expect(JSON.parse(init.body)).toEqual({
      token: "v1.payload.sig",
      action: "export_invoices",
      method: "POST",
      path: "/api/invoices/export",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("sends a null token when the request has none", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...DECISION, verdict: "unknown", token: "missing" }));
    await checkObserve("export_invoices", { request: protectedRequest() });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).token).toBeNull();
  });

  it("prefers explicit token, method and path, and the secretKey and observeUrl options", async () => {
    fetchMock.mockResolvedValue(Response.json(DECISION));
    await checkObserve("invite_teammate", {
      request: protectedRequest("from-header"),
      token: "from-form",
      method: "PUT",
      path: "/team",
      secretKey: "sk_other",
      observeUrl: "https://other.test/",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://other.test/api/v1/decide");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk_other");
    expect(JSON.parse(init.body)).toEqual({ token: "from-form", action: "invite_teammate", method: "PUT", path: "/team" });
  });

  it("fills in wouldBlock from the outcome when the console leaves it out", async () => {
    const { wouldBlock: _, ...rest } = DECISION;
    fetchMock.mockResolvedValue(Response.json({ ...rest, outcome: "refuse" }));
    const d = await checkObserve("export_invoices", { request: protectedRequest("t") });
    expect(d.wouldBlock).toBe(true);
  });

  it("fails open without calling the console when there is no secret key", async () => {
    vi.stubEnv("OBSERVE_SECRET_KEY", "");
    const d = await checkObserve("export_invoices", { request: protectedRequest("v1.payload.sig") });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(d).toEqual({
      mode: "observe",
      verdict: "unknown",
      tier: "unknown",
      driver: null,
      confidence: 0,
      decidedBy: null,
      outcome: "admit",
      wouldBlock: false,
      policy: null,
      token: "unchecked",
      error: expect.stringContaining("OBSERVE_SECRET_KEY"),
    });
  });

  it("reports token: missing when failing open without a token", async () => {
    vi.stubEnv("OBSERVE_SECRET_KEY", "");
    const d = await checkObserve("export_invoices", { request: protectedRequest() });
    expect(d.token).toBe("missing");
  });

  it("fails open on a 500", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    const d = await checkObserve("export_invoices", { request: protectedRequest("t") });
    expect(d).toMatchObject({ outcome: "admit", wouldBlock: false, verdict: "unknown", token: "unchecked" });
    expect(d.error).toContain("500");
  });

  it("fails open on a 401", async () => {
    fetchMock.mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    const d = await checkObserve("export_invoices", { request: protectedRequest("t") });
    expect(d).toMatchObject({ outcome: "admit", wouldBlock: false });
    expect(d.error).toContain("401");
  });

  it("fails open on a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const d = await checkObserve("export_invoices", { request: protectedRequest("t") });
    expect(d).toMatchObject({ outcome: "admit", wouldBlock: false });
    expect(d.error).toContain("fetch failed");
  });

  it("fails open on a body that is not a decision", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    const d = await checkObserve("export_invoices", { request: protectedRequest("t") });
    expect(d).toMatchObject({ outcome: "admit", wouldBlock: false });
    expect(d.error).toBeDefined();
  });

  it("fails open after 1.5 s", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    const pending = checkObserve("export_invoices", { request: protectedRequest("t") });
    await vi.advanceTimersByTimeAsync(1500);
    const d = await pending;
    expect(d).toMatchObject({ outcome: "admit", wouldBlock: false, token: "unchecked" });
    expect(d.error).toMatch(/timed out after 1500 ms/);
  });

  it("warns once per process", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await checkObserve("a", { request: protectedRequest("t") });
    await checkObserve("b", { request: protectedRequest("t") });
    vi.stubEnv("OBSERVE_SECRET_KEY", "");
    await checkObserve("c");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
