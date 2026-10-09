import { describe, expect, it, vi } from "vitest";

/** Loading agent rules from the database: a failure is logged and the sites and prices still load. */

vi.mock("server-only", () => ({}));

const failRules = vi.fn(async (): Promise<unknown[]> => {
  throw new Error("observe_agent_rules_v2 returned 404");
});

vi.mock("../src/lib/db", () => ({
  dbConfigured: true,
  dbWritable: false,
  listSites: async () => [{ id: "shop", name: "Shop", host: "shop.example", environment: "Production", anonymous: false, publishable_key: "pk_shop", secret_key_hash: "" }],
  listPrices: async () => [{ site: "shop", action_id: "export_csv", amount_micro: 250_000, currency: "USD" }],
  listAgentRules: () => failRules(),
  batchesAfter: async () => [],
  jevAfter: async () => [],
}));

describe("syncing agent rules", () => {
  it("logs a failure and still loads sites and prices", async () => {
    delete (globalThis as Record<string, unknown>).__observeSync;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { syncStore } = await import("../src/lib/sync");
    const { siteById } = await import("../src/lib/site");
    const { priceFor } = await import("../src/lib/pricing");
    const { setLocalAgentRule, agentRule } = await import("../src/lib/agent-rules");
    setLocalAgentRule("shop", "comet", "export", "never");

    await syncStore(true);
    expect(siteById("shop")?.name).toBe("Shop");
    expect(priceFor("shop", "export_csv")).toBe(250_000);
    expect(error).toHaveBeenCalledWith("[observe] could not load agent rules:", "observe_agent_rules_v2 returned 404");
    // The rules already in memory stay until a load succeeds.
    expect(agentRule("shop", "comet", "export")).toBe("never");

    failRules.mockResolvedValueOnce([{ site: "shop", subject: "comet", scope: "export", choice: "ask" }]);
    await syncStore(true);
    expect(agentRule("shop", "comet", "export")).toBe("ask");
    error.mockRestore();
  });
});
