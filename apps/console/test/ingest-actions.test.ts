import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { ingest, parseBatch } = await import("../src/lib/ingest");
const { store } = await import("../src/lib/store");

const SITE = "pairing-test";
const passport = { verdict: "agent", tier: "recognised", agentProbability: 0.99, driver: { id: "claude-in-chrome" }, reasons: [] };

function page(sessionId: string, records: unknown[]) {
  return parseBatch({ v: 1, key: "pk_test", deviceId: "d_test", sessionId, pageId: "p1", page: "/", records })!;
}
function server(sessionId: string, actionId: string) {
  return parseBatch({ v: 1, key: "pk_test", sessionId, pageId: "server", page: "/", deviceId: "server", records: [{ type: "decision", t: 0, actionId }] })!;
}
const actions = (id: string) => store.sensor.get(id)!.events.filter((e) => e.type === "action").map((e) => e.action!.id);

describe("protected actions reported by the page and the server", () => {
  const T0 = 1_800_000_000_000;
  let n = 0;
  let sid = "";
  beforeEach(() => {
    sid = `s_pairing_${n++}`;
    ingest(page(sid, [{ type: "start", t: 0 }]), T0, {}, SITE);
  });

  it("count once when the server's decision follows the page's record", () => {
    ingest(page(sid, [{ type: "protect", t: 2_000, actionId: "export_invoices", passport }]), T0 + 2_000, {}, SITE);
    ingest(server(sid, "export_invoices"), T0 + 2_400, { server: true }, SITE);
    expect(actions(sid)).toEqual(["export_invoices"]);
  });

  it("count once when the server's decision arrives first", () => {
    ingest(server(sid, "export_invoices"), T0 + 2_000, { server: true }, SITE);
    ingest(page(sid, [{ type: "protect", t: 1_900, actionId: "export_invoices", passport }]), T0 + 6_000, {}, SITE);
    expect(actions(sid)).toEqual(["export_invoices"]);
  });

  it("still count two real requests twice", () => {
    ingest(page(sid, [{ type: "protect", t: 2_000, actionId: "export_invoices", passport }]), T0 + 2_000, {}, SITE);
    ingest(server(sid, "export_invoices"), T0 + 2_300, { server: true }, SITE);
    ingest(page(sid, [{ type: "protect", t: 3_000, actionId: "export_invoices", passport }]), T0 + 3_000, {}, SITE);
    ingest(server(sid, "export_invoices"), T0 + 3_300, { server: true }, SITE);
    expect(actions(sid)).toEqual(["export_invoices", "export_invoices"]);
  });

  it("keep different actions apart", () => {
    ingest(page(sid, [{ type: "protect", t: 2_000, actionId: "export_invoices", passport }]), T0 + 2_000, {}, SITE);
    ingest(server(sid, "invite_teammate"), T0 + 2_300, { server: true }, SITE);
    expect(actions(sid).sort()).toEqual(["export_invoices", "invite_teammate"]);
  });
});
