import { findRule, matchPath, normaliseRules, TOKEN_FIELD, TOKEN_HEADER } from "../src/core/protect";
import { Sensor } from "../src/sensor";
import type { ProtectRule } from "../src/types";

const RULES: ProtectRule[] = [
  { path: "/api/invoices/export", action: "export_invoices" },
  { path: "/api/teams/*/invite", method: "post", action: "invite_user" },
  { path: "/api/admin/*", method: "DELETE", action: "admin_delete" },
];

describe("rule matching", () => {
  it("matches paths exactly, * as one segment, trailing * as the rest", () => {
    expect(matchPath("/api/invoices/export", "/api/invoices/export")).toBe(true);
    expect(matchPath("/api/invoices/export", "/api/invoices/export/")).toBe(false);
    expect(matchPath("/api/invoices/export", "/api/invoices")).toBe(false);
    expect(matchPath("/api/invoices/export", "/api/invoices/export/csv")).toBe(false);
    expect(matchPath("/api/teams/*/invite", "/api/teams/t_1/invite")).toBe(true);
    expect(matchPath("/api/teams/*/invite", "/api/teams//invite")).toBe(false);
    expect(matchPath("/api/teams/*/invite", "/api/teams/a/b/invite")).toBe(false);
    expect(matchPath("/api/admin/*", "/api/admin/users")).toBe(true);
    expect(matchPath("/api/admin/*", "/api/admin/users/42")).toBe(true);
    expect(matchPath("/api/admin/*", "/api/admin/")).toBe(false);
    expect(matchPath("/api/admin/*", "/api/admin")).toBe(false);
    expect(matchPath("*", "/anything/at/all")).toBe(true);
  });

  it("matches the method case-insensitively, POST by default, * for any", () => {
    expect(findRule(RULES, "POST", "/api/invoices/export")?.action).toBe("export_invoices");
    expect(findRule(RULES, "post", "/api/invoices/export?format=csv")?.action).toBe("export_invoices");
    expect(findRule(RULES, "GET", "/api/invoices/export")).toBeNull();
    expect(findRule(RULES, "POST", "/api/teams/t_9/invite")?.action).toBe("invite_user");
    expect(findRule(RULES, "delete", "/api/admin/users/42")?.action).toBe("admin_delete");
    expect(findRule(RULES, "POST", "/api/admin/users/42")).toBeNull();
    expect(findRule([{ path: "/x", method: "*", action: "any" }], "PATCH", "/x")?.action).toBe("any");
  });

  it("only matches same-origin http(s) URLs", () => {
    expect(findRule(RULES, "POST", `${location.origin}/api/invoices/export`)?.action).toBe("export_invoices");
    expect(findRule(RULES, "POST", "https://other.example/api/invoices/export")).toBeNull();
    expect(findRule(RULES, "POST", "//other.example/api/invoices/export")).toBeNull();
    expect(findRule(RULES, "POST", "data:text/plain,hi")).toBeNull();
  });

  it("drops malformed rules from untyped config", () => {
    expect(normaliseRules("nope")).toEqual([]);
    expect(normaliseRules([{ path: "/a", action: "a" }, { path: "/b" }, null, { action: "c" }, { path: "/d", method: 3, action: "d" }])).toEqual([
      { path: "/a", method: undefined, action: "a" },
      { path: "/d", method: undefined, action: "d" },
    ]);
  });
});

// ───────────── wrappers ─────────────

type Call = { self: unknown; args: unknown[] };

/** A fake `fetch`: the collector hands out a token (or hangs); everything else is recorded as page traffic. */
function installFetch(token: string | null = "v1.tok.sig") {
  const page: Call[] = [];
  const collector: Call[] = [];
  const state = { hang: false };
  const fn = function (this: unknown, ...args: unknown[]) {
    const [input] = args as [RequestInfo | URL];
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/v1/sdk/events")) {
      collector.push({ self: this, args });
      if (state.hang) return new Promise<Response>(() => {});
      if (!token) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify({ token, exp: Date.now() + 60_000 }), { status: 200 }));
    }
    page.push({ self: this, args });
    return Promise.resolve(new Response("ok"));
  };
  window.fetch = fn as unknown as typeof fetch;
  return { fn, page, collector, state };
}

/** A fake XMLHttpRequest that records what reaches the real methods. */
class FakeXhr {
  static log: string[] = [];
  headers: [string, string][] = [];
  sent: unknown[] | null = null;
  open(...args: unknown[]) {
    FakeXhr.log.push(`open ${args.join(" ")}`);
  }
  setRequestHeader(name: string, value: string) {
    this.headers.push([name, value]);
  }
  send(...args: unknown[]) {
    this.sent = args;
    FakeXhr.log.push("send");
  }
  abort() {
    FakeXhr.log.push("abort");
  }
}

const realFetch = window.fetch;
const realXhr = window.XMLHttpRequest;
let sensors: Sensor[] = [];
function sensor(config: ConstructorParameters<typeof Sensor>[0] = {}): Sensor {
  const s = new Sensor({ endpoint: "/_observe", publishableKey: "pk_test", flushIntervalMs: 60_000, protect: RULES, ...config });
  sensors.push(s);
  s.start();
  return s;
}
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  FakeXhr.log = [];
  window.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
});

afterEach(() => {
  for (const s of sensors) s.destroy();
  sensors = [];
  window.fetch = realFetch;
  window.XMLHttpRequest = realXhr;
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("fetch wrapper", () => {
  it("adds x-observe-token to a matching same-origin request after protectAsync", async () => {
    const f = installFetch();
    const s = sensor();
    const init = { method: "POST", body: "{\"a\":1}", headers: { "content-type": "application/json" } };
    const res = await window.fetch("/api/invoices/export", init);
    expect(await res.text()).toBe("ok");
    expect(f.collector).toHaveLength(1);
    expect(String((f.collector[0]!.args[1] as RequestInit).body)).toContain("export_invoices");
    const [input, sent] = f.page[0]!.args as [string, RequestInit];
    expect(input).toBe("/api/invoices/export");
    const h = new Headers(sent.headers);
    expect(h.get(TOKEN_HEADER)).toBe("v1.tok.sig");
    expect(h.get("content-type")).toBe("application/json");
    expect(sent.body).toBe(init.body);
    expect(sent.method).toBe("POST");
    // The caller's init object is not modified.
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(s.token()).toBe("v1.tok.sig");
  });

  it("leaves cross-origin, non-matching and wrong-method requests byte-identical", async () => {
    const f = installFetch();
    sensor();
    const init = { method: "POST", body: "x" };
    const cases: unknown[][] = [
      ["https://other.example/api/invoices/export", init],
      ["/api/invoices/list", init],
      ["/api/invoices/export"],
      ["/api/invoices/export", { method: "GET" }],
      [new URL("https://other.example/api/invoices/export"), init],
    ];
    for (const args of cases) {
      await (window.fetch as (...a: unknown[]) => Promise<Response>)(...args);
      const got = f.page.at(-1)!.args;
      expect(got).toHaveLength(args.length);
      got.forEach((a, i) => expect(a).toBe(args[i]));
    }
    expect(f.collector).toHaveLength(0);
  });

  it("merges headers into a Request object without touching its body", async () => {
    const f = installFetch();
    sensor();
    const req = new Request("/api/invoices/export", { method: "POST", headers: { "x-app": "1" }, body: "payload" });
    await window.fetch(req);
    const [input, init] = f.page[0]!.args as [Request, RequestInit];
    expect(input).toBe(req);
    expect(req.bodyUsed).toBe(false);
    const merged = new Request(input, init);
    expect(merged.headers.get("x-app")).toBe("1");
    expect(merged.headers.get(TOKEN_HEADER)).toBe("v1.tok.sig");
    expect(merged.method).toBe("POST");
    expect(await merged.text()).toBe("payload");
  });

  it("uses init headers over the Request's own, as fetch does", async () => {
    const f = installFetch();
    sensor();
    const req = new Request("/api/invoices/export", { method: "POST", headers: { "x-app": "1" } });
    await window.fetch(req, { headers: { "x-init": "2" } });
    const h = new Headers((f.page[0]!.args[1] as RequestInit).headers);
    expect(h.get("x-init")).toBe("2");
    expect(h.get("x-app")).toBeNull();
    expect(h.get(TOKEN_HEADER)).toBe("v1.tok.sig");
  });

  it("preserves this and the return value", async () => {
    const f = installFetch();
    sensor();
    const res = await window.fetch.call(window, "/api/invoices/export", { method: "POST" });
    expect(res).toBeInstanceOf(Response);
    expect(f.page[0]!.self).toBe(window);
  });

  it("sends the original arguments when no token is available", async () => {
    const f = installFetch(null);
    sensor();
    const init = { method: "POST", body: "x" };
    await window.fetch("/api/invoices/export", init);
    expect(f.collector).toHaveLength(1);
    expect(f.page[0]!.args[1]).toBe(init);
  });

  it("waits at most 1.5 s for the token, then sends without it", async () => {
    vi.useFakeTimers();
    const f = installFetch();
    f.state.hang = true;
    sensor();
    const init = { method: "POST" };
    const p = window.fetch("/api/invoices/export", init);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.page).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    await p;
    expect(f.page[0]!.args[1]).toBe(init);
  });

  it("never protects the sensor's own collector traffic, even under a catch-all rule", async () => {
    const f = installFetch();
    const s = sensor({ protect: [{ path: "*", method: "*", action: "everything" }] });
    s.identify({ userId: "u1" });
    await (s as unknown as { transport: { flush: (u: boolean) => Promise<void> } }).transport.flush(false);
    expect(f.collector).toHaveLength(1);
    expect(f.page).toHaveLength(0);
  });

  it("does not wrap anything without protect rules", () => {
    installFetch();
    const before = window.fetch;
    sensor({ protect: undefined });
    expect(window.fetch).toBe(before);
  });
});

describe("XMLHttpRequest wrapper", () => {
  it("adds the header to a matching request and then sends it", async () => {
    installFetch();
    sensor();
    const x = new XMLHttpRequest() as unknown as FakeXhr;
    (x as unknown as XMLHttpRequest).open("POST", "/api/invoices/export");
    (x as unknown as XMLHttpRequest).send("body");
    expect(x.sent).toBeNull();
    await settle();
    expect(x.headers).toEqual([[TOKEN_HEADER, "v1.tok.sig"]]);
    expect(x.sent).toEqual(["body"]);
    expect(FakeXhr.log).toEqual(["open POST /api/invoices/export", "send"]);
  });

  it("sends other requests at once and untouched", () => {
    installFetch();
    sensor();
    const x = new XMLHttpRequest() as unknown as FakeXhr & XMLHttpRequest;
    x.open("POST", "https://other.example/api/invoices/export");
    x.send("body");
    expect(x.sent).toEqual(["body"]);
    expect(x.headers).toEqual([]);
    const y = new XMLHttpRequest() as unknown as FakeXhr & XMLHttpRequest;
    y.open("GET", "/api/invoices/export");
    y.send();
    expect(y.sent).toEqual([]);
    expect(y.headers).toEqual([]);
  });

  it("does not send a request aborted while it waited for the token", async () => {
    vi.useFakeTimers();
    const f = installFetch();
    f.state.hang = true;
    sensor();
    const x = new XMLHttpRequest() as unknown as FakeXhr & XMLHttpRequest;
    x.open("POST", "/api/invoices/export");
    x.send("body");
    x.abort();
    await vi.advanceTimersByTimeAsync(1600);
    expect(x.sent).toBeNull();
  });

  it("gives a synchronous request the token held now", async () => {
    installFetch();
    const s = sensor();
    await (s as unknown as { transport: { flush: (u: boolean) => Promise<void> } }).transport.flush(false);
    const x = new XMLHttpRequest() as unknown as FakeXhr & XMLHttpRequest;
    x.open("POST", "/api/invoices/export", false);
    x.send("body");
    expect(x.sent).toEqual(["body"]);
    expect(x.headers).toEqual([[TOKEN_HEADER, "v1.tok.sig"]]);
  });
});

describe("form posts", () => {
  function form(html: string): HTMLFormElement {
    document.body.innerHTML = html;
    return document.querySelector("form")!;
  }
  function submit(f: HTMLFormElement, submitter?: HTMLElement) {
    const e = new Event("submit", { bubbles: true, cancelable: true }) as SubmitEvent;
    Object.defineProperty(e, "submitter", { value: submitter ?? null });
    f.dispatchEvent(e);
  }

  it("adds a hidden observe_token input with the current token and records the action", async () => {
    const f = installFetch();
    const s = sensor();
    await (s as unknown as { transport: { flush: (u: boolean) => Promise<void> } }).transport.flush(false);
    const el = form(`<form method="post" action="/api/invoices/export"><input name="action" value="shadow"><button>Go</button></form>`);
    submit(el);
    const input = el.querySelector<HTMLInputElement>(`input[name="${TOKEN_FIELD}"]`);
    expect(input?.type).toBe("hidden");
    expect(input?.value).toBe("v1.tok.sig");
    await settle();
    const last = f.collector.at(-1)!.args[1] as RequestInit;
    expect(last.keepalive).toBe(true);
    expect(String(last.body)).toContain("export_invoices");
    // A second submission replaces the value rather than adding another input.
    submit(el);
    expect(el.querySelectorAll(`input[name="${TOKEN_FIELD}"]`)).toHaveLength(1);
  });

  it("honours the submitter's formaction and formmethod", async () => {
    installFetch();
    const s = sensor();
    await (s as unknown as { transport: { flush: (u: boolean) => Promise<void> } }).transport.flush(false);
    const el = form(`<form method="get" action="/search"><button formmethod="post" formaction="/api/teams/t1/invite">Invite</button></form>`);
    submit(el, el.querySelector("button")!);
    expect(el.querySelector<HTMLInputElement>(`input[name="${TOKEN_FIELD}"]`)?.value).toBe("v1.tok.sig");
  });

  it("leaves GET, cross-origin and non-matching forms alone", async () => {
    const f = installFetch();
    const s = sensor();
    await (s as unknown as { transport: { flush: (u: boolean) => Promise<void> } }).transport.flush(false);
    const sentBefore = f.collector.length;
    for (const html of [
      `<form method="get" action="/api/invoices/export"></form>`,
      `<form method="post" action="https://other.example/api/invoices/export"></form>`,
      `<form method="post" action="/api/other"></form>`,
    ]) {
      const el = form(html);
      submit(el);
      expect(el.querySelector(`input[name="${TOKEN_FIELD}"]`)).toBeNull();
    }
    await settle();
    expect(f.collector.length).toBe(sentBefore);
  });
});

describe("destroy", () => {
  it("restores fetch and XMLHttpRequest and removes added inputs", async () => {
    installFetch();
    const fetchBefore = window.fetch;
    const { open, send, abort } = XMLHttpRequest.prototype;
    const s = sensor();
    expect(window.fetch).not.toBe(fetchBefore);
    expect(XMLHttpRequest.prototype.send).not.toBe(send);
    await (s as unknown as { transport: { flush: (u: boolean) => Promise<void> } }).transport.flush(false);
    document.body.innerHTML = `<form method="post" action="/api/invoices/export"></form>`;
    const el = document.querySelector("form")!;
    el.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(el.querySelector(`input[name="${TOKEN_FIELD}"]`)).not.toBeNull();
    s.destroy();
    expect(window.fetch).toBe(fetchBefore);
    expect(XMLHttpRequest.prototype.open).toBe(open);
    expect(XMLHttpRequest.prototype.send).toBe(send);
    expect(XMLHttpRequest.prototype.abort).toBe(abort);
    expect(el.querySelector(`input[name="${TOKEN_FIELD}"]`)).toBeNull();
    // And no longer listens for submissions.
    el.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(el.querySelector(`input[name="${TOKEN_FIELD}"]`)).toBeNull();
  });

  it("leaves a later wrapper in place and passes through", async () => {
    const f = installFetch();
    const s = sensor();
    const ours = window.fetch;
    const theirs = function (this: unknown, ...a: Parameters<typeof fetch>) {
      return ours.apply(this, a);
    } as typeof fetch;
    window.fetch = theirs;
    s.destroy();
    expect(window.fetch).toBe(theirs);
    const flushed = f.collector.length;
    const init = { method: "POST" };
    await window.fetch("/api/invoices/export", init);
    expect(f.page[0]!.args[1]).toBe(init);
    expect(f.collector).toHaveLength(flushed);
  });
});

describe("script tag", () => {
  it("reads data-protect and exposes window.ObserveSensor.instance", async () => {
    installFetch();
    vi.resetModules();
    delete (window as { ObserveSensor?: unknown }).ObserveSensor;
    const script = document.createElement("script");
    script.dataset.endpoint = "/_observe";
    script.dataset.protect = JSON.stringify([{ path: "/api/invoices/export", action: "export_invoices" }]);
    Object.defineProperty(document, "currentScript", { configurable: true, get: () => script });
    try {
      await import("../src/global");
    } finally {
      delete (document as { currentScript?: unknown }).currentScript;
    }
    const inst = window.ObserveSensor?.instance;
    expect(inst).toBeDefined();
    sensors.push(inst!);
    expect(inst!.config.protect).toEqual([{ path: "/api/invoices/export", action: "export_invoices" }]);
    expect(typeof window.ObserveSensor?.init).toBe("function");
    delete (window as { ObserveSensor?: unknown }).ObserveSensor;
  });

  it("init() from page code also sets window.ObserveSensor.instance", async () => {
    installFetch();
    vi.resetModules();
    delete (window as { ObserveSensor?: unknown }).ObserveSensor;
    const { init } = await import("../src/index");
    const s = init({ publishableKey: "pk_direct" });
    sensors.push(s);
    expect(window.ObserveSensor?.instance).toBe(s);
    delete (window as { ObserveSensor?: unknown }).ObserveSensor;
  });
});
