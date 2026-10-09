import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { canonicalDriver, getDriver } = await import("../src/lib/catalog");
const { ingest, parseBatch } = await import("../src/lib/ingest");
const { store } = await import("../src/lib/store");

describe("renamed drivers", () => {
  it("map an old registry id to the current one", () => {
    expect(canonicalDriver("anthropic-browser-demo")).toBe("anthropic-browser-tooling");
    expect(canonicalDriver("claude-in-chrome")).toBe("claude-in-chrome");
    expect(getDriver("anthropic-browser-demo")?.id).toBe("anthropic-browser-tooling");
  });

  it("are renamed as older sensors report them", () => {
    const batch = parseBatch({
      v: 1,
      key: "pk_test",
      deviceId: "d_alias",
      sessionId: "s_alias",
      pageId: "p1",
      page: "/",
      records: [{ type: "passport", t: 1, passport: { verdict: "agent", tier: "recognised", agentProbability: 0.99, driver: { id: "anthropic-browser-demo" }, reasons: [] } }],
    })!;
    ingest(batch, 1_800_000_000_000, {}, "alias-test");
    expect(store.sensor.get("s_alias")?.rules?.driverId).toBe("anthropic-browser-tooling");
  });
});
