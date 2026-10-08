import { describe, expect, it, vi } from "vitest";

/**
 * Against a real database: stores sensor batches, syncs them into memory, stores Jev's answer, then checks that a
 * cold server instance rebuilds the same session from the database alone.
 *
 * Runs only with a database token scoped to the throwaway site `local-test`, so it never touches a real site's data:
 *   OBSERVE_TEST_SUPABASE_URL=... OBSERVE_TEST_SUPABASE_KEY=... OBSERVE_TEST_DB_TOKEN=... pnpm --filter @observe/console test
 */

vi.mock("server-only", () => ({}));

const URL_ = process.env.OBSERVE_TEST_SUPABASE_URL;
const KEY = process.env.OBSERVE_TEST_SUPABASE_KEY;
const TOKEN = process.env.OBSERVE_TEST_DB_TOKEN;

type G = Record<string, unknown>;

/** Load the console's modules as a fresh server instance would: empty store, no sync cursor. */
async function coldStart() {
  const g = globalThis as G;
  delete g.__observeSync;
  delete g.__observeStore;
  g.__observeSensor = new Map();
  vi.resetModules();
  process.env.SUPABASE_URL = URL_;
  process.env.SUPABASE_KEY = KEY;
  process.env.OBSERVE_DB_TOKEN = TOKEN;
  process.env.OBSERVE_DEMO = "0";
  const [db, sync, store] = await Promise.all([import("../src/lib/db"), import("../src/lib/sync"), import("../src/lib/store")]);
  return { ...db, ...sync, ...store };
}

function batch(sessionId: string, pageId: string, records: unknown[]) {
  return { v: 1, sdk: "test", key: "pk_test", deviceId: "dev_test", sessionId, pageId, page: "/research/", identity: {}, label: null, records, lab: [{ big: true }] };
}

describe.skipIf(!URL_ || !KEY || !TOKEN)("database sync", () => {
  it("replays stored batches and Jev answers into a cold instance", async () => {
    const id = `s_test_${Date.now().toString(36)}`;
    const a = await coldStart();
    expect(a.dbConfigured).toBe(true);

    const now = Date.now();
    await a.putBatch("local-test", id, now - 2_000, { ua: "Mozilla/5.0 test", country: "CA" }, batch(id, "p1", [
      { type: "reason", key: "env.webdriver", reason: { id: "env.webdriver", label: "navigator.webdriver is true", robustness: "decisive", decisive: true, drivers: { playwright: 1 }, t: 5 } },
      { type: "action", record: { kind: "click", index: 0, t: 400 }, reasons: [] },
      { type: "action", record: { kind: "scroll", index: 1, t: 900 }, reasons: [] },
    ]));
    await a.putBatch("local-test", id, now - 1_000, {}, batch(id, "p1", [
      { type: "protect", t: 1_400, actionId: "download_paper", passport: { verdict: "agent", tier: "recognised", agentProbability: 0.99, driver: { id: "playwright" }, reasons: [] } },
    ]));
    await a.syncStore(true);

    const stored = await a.batchesAfter(0, now - 60_000, 2_000);
    expect(stored.filter((r) => r.session_id === id).some((r) => "lab" in (r.body as object))).toBe(false);

    const rec = a.store.sensor.get(id);
    expect(rec).toBeDefined();
    expect(rec!.site).toBe("local-test");
    expect(rec!.session.verdict).toBe("agent");
    expect(rec!.session.decidedBy).toBe("exact-match");
    expect(rec!.actionCount).toBe(2);
    expect(rec!.client).toMatchObject({ ua: "Mozilla/5.0 test", country: "CA" });
    expect(rec!.events.some((e) => e.action?.label === "Download a paper")).toBe(true);

    const answer = { agentProbability: 0.97, choice: "puppeteer", confidence: 0.8, candidates: [{ id: "puppeteer", p: 0.8 }], at: now, model: "test", latencyMs: 1, inputTokens: 1, actionsSeen: 2 };
    await a.putJev("local-test", id, answer, "2|1", now);

    // A second instance knows nothing yet: it must build the same session, and Jev's naming, from the database.
    const b = await coldStart();
    await b.syncStore(true);
    const again = b.store.sensor.get(id);
    expect(again?.session.verdict).toBe("agent");
    expect(again?.actionCount).toBe(2);
    expect(again?.jev?.choice).toBe("puppeteer");
    expect(again?.jevStatus.key).toBe("2|1");
    expect(again?.session.driverId).toBe("puppeteer");
  }, 30_000);

  it("only sees its own site", async () => {
    const a = await coldStart();
    expect((await a.listSites()).map((s) => s.id)).toEqual(["local-test"]);
    await expect(a.putBatch("arzach", "s_not_mine", Date.now(), {}, batch("s_not_mine", "p1", []))).rejects.toThrow(/forbidden/);
  });

  it("refuses a wrong token", async () => {
    await coldStart();
    process.env.OBSERVE_DB_TOKEN = "not-the-token";
    vi.resetModules();
    const db = await import("../src/lib/db");
    await expect(db.jevAfter(0)).rejects.toThrow(/forbidden/);
  });
});
