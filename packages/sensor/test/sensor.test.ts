import { Sensor } from "../src/sensor";
import type { Passport } from "../src/types";

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = `<input id="q" type="text"><input id="pw" type="password"><select id="s"><option>a</option><option>b</option></select>`;
});

describe("Sensor", () => {
  it("starts, identifies a script fill on a text field, and reports it", async () => {
    const s = new Sensor();
    s.start();
    const q = document.getElementById("q") as HTMLInputElement;
    q.value = "northwind";
    q.dispatchEvent(new Event("input", { bubbles: true }));
    const snap = s.protect("export_csv");
    expect(snap.actionId).toBe("export_csv");
    expect(snap.passport.reasons.map((r) => r.id)).toContain("typing.untrusted");
    s.destroy();
  });

  it("counts a dropdown set by script", () => {
    const s = new Sensor();
    s.start();
    const sel = document.getElementById("s") as HTMLSelectElement;
    sel.value = "b";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(s.protect("filter").passport.reasons.map((r) => r.id)).toContain("typing.untrusted");
    s.destroy();
  });

  it("never counts synthetic fills on password fields (password managers)", () => {
    const s = new Sensor();
    s.start();
    const pw = document.getElementById("pw") as HTMLInputElement;
    pw.value = "x";
    pw.dispatchEvent(new Event("input", { bubbles: true }));
    expect(s.protect("login").passport.reasons.map((r) => r.id)).not.toContain("typing.untrusted");
    s.destroy();
  });

  it("names the driver when an agent overlay appears", async () => {
    const s = new Sensor();
    const seen: Passport[] = [];
    s.onPassport((p) => seen.push(p));
    s.start();
    const el = document.createElement("div");
    el.id = "claude-agent-stop-container";
    document.body.appendChild(el);
    await tick();
    const p = s.getPassport();
    expect(p.verdict).toBe("agent");
    expect(p.driver?.id).toBe("claude-in-chrome");
    expect(seen.at(-1)?.driver?.id).toBe("claude-in-chrome");
    s.destroy();
  });

  it("holds collection until consent is given", () => {
    const s = new Sensor({ waitForConsent: true });
    s.start();
    expect(s.running).toBe(false);
    s.optIn();
    expect(s.running).toBe(true);
    s.optOut();
    expect(s.running).toBe(false);
    // A saved refusal blocks the next sensor too.
    const next = new Sensor();
    next.start();
    expect(next.running).toBe(false);
  });

  it("applies a verified passport from the edge", () => {
    const s = new Sensor();
    s.start();
    s.setPassport({ source: "signature", driver: { id: "chatgpt-agent", name: "ChatGPT agent", provider: "OpenAI", kind: "cloud-browser", confidence: 1, score: 99 } });
    const p = s.getPassport();
    expect(p.tier).toBe("verified");
    expect(p.source).toBe("signature");
    expect(p.driver?.id).toBe("chatgpt-agent");
    s.destroy();
  });

  it("exports the session as JSON without field values", () => {
    const s = new Sensor({ labDriver: "unit-test" });
    s.start();
    const q = document.getElementById("q") as HTMLInputElement;
    q.value = "secret-text";
    q.dispatchEvent(new Event("input", { bubbles: true }));
    s.protect("x");
    const json = s.exportSession();
    const data = JSON.parse(json);
    expect(data.label).toBe("unit-test");
    expect(json).not.toContain("secret-text");
    s.destroy();
  });

  it("removes its listeners on destroy", () => {
    const s = new Sensor();
    s.start();
    s.destroy();
    const q = document.getElementById("q") as HTMLInputElement;
    q.dispatchEvent(new Event("input", { bubbles: true }));
    expect(s.getHistory()).toHaveLength(0);
  });

  it("sends batches to the collector", async () => {
    const calls: { url: string; body: string }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response("{}", { status: 202 });
    }) as typeof fetch;
    const s = new Sensor({ endpoint: "https://collector.example", publishableKey: "pk_test", flushIntervalMs: 60_000 });
    s.start();
    s.identify({ userId: "usr_1", accountId: "acct_1" });
    await (s as unknown as { transport: { flush: (b: boolean) => Promise<void> } }).transport.flush(false);
    globalThis.fetch = original;
    expect(calls[0]?.url).toBe("https://collector.example/v1/sdk/events");
    const body = JSON.parse(calls[0]!.body);
    expect(body.sessionId).toMatch(/^s_/);
    expect(body.records.some((r: { type: string }) => r.type === "identify")).toBe(true);
    s.destroy();
  });
});
