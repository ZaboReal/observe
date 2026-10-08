import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const incoming = vi.hoisted(() => ({ headers: new Headers(), throws: false }));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (incoming.throws) throw new Error("`headers` was called outside a request scope");
    return incoming.headers;
  },
}));

import { resetWarning } from "../src/check";
import { observe } from "../src/server";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("OBSERVE_URL", "http://console.test");
  vi.stubEnv("OBSERVE_SECRET_KEY", "sk_shop_secret");
  fetchMock = vi.fn().mockResolvedValue(Response.json({ mode: "observe", verdict: "human", outcome: "admit", wouldBlock: false }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  resetWarning();
  incoming.headers = new Headers();
  incoming.throws = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sentBody = () => JSON.parse(fetchMock.mock.calls[0]![1].body);

describe("observe.check", () => {
  it("reads x-observe-token from next/headers", async () => {
    incoming.headers = new Headers({ "x-observe-token": "v1.from.headers", cookie: "session=secret" });
    await observe.check("export_invoices");
    expect(sentBody()).toEqual({ token: "v1.from.headers", action: "export_invoices" });
  });

  it("uses the request passed in instead of next/headers", async () => {
    incoming.headers = new Headers({ "x-observe-token": "v1.from.headers" });
    const request = new Request("https://shop.example/api/invoices/export", { method: "POST", headers: { "x-observe-token": "v1.from.request" } });
    await observe.check("export_invoices", { request });
    expect(sentBody()).toEqual({ token: "v1.from.request", action: "export_invoices", method: "POST", path: "/api/invoices/export" });
  });

  it("passes method and path through", async () => {
    await observe.check("invite_teammate", { method: "POST", path: "/" });
    expect(sentBody()).toEqual({ token: null, action: "invite_teammate", method: "POST", path: "/" });
  });

  it("treats headers() outside a request as no token", async () => {
    incoming.throws = true;
    const d = await observe.check("export_invoices");
    expect(sentBody().token).toBeNull();
    expect(d.outcome).toBe("admit");
  });
});
