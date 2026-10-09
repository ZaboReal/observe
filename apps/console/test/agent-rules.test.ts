import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { agentRule, resolveRule, ruleFor, ruleSubjects, setLocalAgentRule, setStoredAgentRules, subjectTier } from "../src/lib/agent-rules";
import { decide, lockedScope } from "../src/lib/policy";
import type { ActionDef, Tier } from "../src/lib/types";

const { allowedScopes, ruleChange, ruleRows, ruleSummary } = await import("../src/lib/views");

const action = (id: string, scope: ActionDef["scope"], risk: ActionDef["risk"] = "medium"): ActionDef => ({ id, label: id, method: "POST", path: "/", route: "/", scope, risk });

const exportCsv = action("export_csv", "export");
const readPage = action("read_page", "view", "low");
const remove = action("delete_workspace", "delete", "critical");

const SITE = "shop";
const claude = { tier: "recognised" as Tier, driverId: "claude-in-chrome" };
const comet = { tier: "recognised" as Tier, driverId: "comet" };
const signed = { tier: "verified" as Tier, driverId: "chatgpt-agent" };
const unnamed = { tier: "unknown-automation" as Tier, driverId: null };

beforeEach(() => {
  setStoredAgentRules([
    { site: SITE, subject: "any-recognised", scope: "export", choice: "never" },
    { site: SITE, subject: "claude-in-chrome", scope: "export", choice: "allow" },
    { site: SITE, subject: "any-recognised", scope: "edit", choice: "allow" },
    { site: SITE, subject: "unnamed", scope: "view", choice: "never" },
    // Stored by hand: no rule may loosen a limit the site sets for every agent.
    { site: SITE, subject: "claude-in-chrome", scope: "delete", choice: "allow" },
    // Not a scope or a choice the console knows: ignored.
    { site: SITE, subject: "comet", scope: "teleport", choice: "allow" },
    { site: SITE, subject: "comet", scope: "view", choice: "maybe" },
  ]);
});

describe("resolving a rule", () => {
  it("uses the agent's own rule, then its group's, then the default", () => {
    expect(ruleFor(SITE, claude, "export")).toEqual({ choice: "allow", subject: "claude-in-chrome" });
    expect(ruleFor(SITE, comet, "export")).toEqual({ choice: "never", subject: "any-recognised" });
    expect(ruleFor(SITE, claude, "edit")).toEqual({ choice: "allow", subject: "any-recognised" });
    expect(ruleFor(SITE, claude, "view")).toBeNull();
    expect(ruleFor(SITE, unnamed, "view")).toEqual({ choice: "never", subject: "unnamed" });
  });

  it("keeps groups and sites apart", () => {
    // A recognised group rule says nothing about verified agents.
    expect(ruleFor(SITE, signed, "export")).toBeNull();
    expect(ruleFor("other-site", claude, "export")).toBeNull();
    expect(ruleFor(SITE, comet, "view")).toBeNull();
  });

  it("decides with the rule, and names it as the policy", () => {
    expect(decide("recognised", exportCsv, null, ruleFor(SITE, claude, "export"))).toEqual({ outcome: "admit", policy: "site/claude-in-chrome/export" });
    expect(decide("recognised", exportCsv, null, ruleFor(SITE, comet, "export"))).toEqual({ outcome: "refuse", policy: "site/any-recognised/export" });
    expect(decide("verified", exportCsv, null, ruleFor(SITE, signed, "export"))).toEqual({ outcome: "admit", policy: "default/verified" });
    expect(decide("recognised", exportCsv)).toEqual({ outcome: "request_access", policy: "default/export-needs-approval" });
  });

  it("takes this server's own writes before the next sync", () => {
    setLocalAgentRule(SITE, "comet", "export", "ask");
    expect(agentRule(SITE, "comet", "export")).toBe("ask");
    expect(ruleFor(SITE, comet, "export")).toEqual({ choice: "ask", subject: "comet" });
    setLocalAgentRule(SITE, "comet", "export", null);
    expect(agentRule(SITE, "comet", "export")).toBeNull();
    expect(ruleFor(SITE, comet, "export")).toEqual({ choice: "never", subject: "any-recognised" });
    expect(ruleSubjects(SITE).sort()).toEqual(["any-recognised", "claude-in-chrome", "unnamed"]);
  });

  it("knows whom a rule can be for", () => {
    expect(subjectTier("any-verified")).toBe("verified");
    expect(subjectTier("any-recognised")).toBe("recognised");
    expect(subjectTier("unnamed")).toBe("unknown-automation");
    expect(subjectTier("claude-in-chrome")).toBe("recognised");
    expect(subjectTier("chatgpt-agent")).toBe("verified");
    expect(subjectTier("people")).toBeNull();
    expect(subjectTier("Not An Id")).toBeNull();
  });
});

describe("each choice", () => {
  const rule = (choice: "allow" | "ask" | "never") => ({ choice, subject: "any-recognised" });

  it("allows, asks the person, or refuses, for every kind of agent", () => {
    for (const tier of ["verified", "recognised", "unknown-automation"] as const) {
      expect(decide(tier, exportCsv, null, rule("allow")).outcome).toBe("admit");
      expect(decide(tier, exportCsv, null, rule("ask")).outcome).toBe("ask");
      expect(decide(tier, exportCsv, null, rule("never")).outcome).toBe("refuse");
    }
  });

  it("still bills an allowed recognised or verified agent when the action has a price", () => {
    expect(decide("recognised", exportCsv, 250_000, rule("allow"))).toEqual({ outcome: "bill", policy: "pricing/export_csv", price: 250_000 });
    expect(decide("verified", readPage, 2_000, rule("allow")).outcome).toBe("bill");
    // Asking the person or refusing is never sold, and unknown automation is never billed.
    expect(decide("recognised", exportCsv, 250_000, rule("ask")).outcome).toBe("ask");
    expect(decide("recognised", exportCsv, 250_000, rule("never")).outcome).toBe("refuse");
    expect(decide("unknown-automation", exportCsv, 250_000, rule("allow")).outcome).toBe("admit");
  });

  it("never changes what people or undecided sessions may do", () => {
    expect(decide("human", exportCsv, null, rule("never"))).toEqual({ outcome: "admit", policy: "people/role" });
    expect(decide("unknown", exportCsv, null, rule("allow"))).toEqual({ outcome: "ask", policy: "default/undecided-ask" });
    expect(decide("unknown", readPage, null, rule("never"))).toEqual({ outcome: "admit", policy: "default/undecided-low-risk" });
    expect(ruleFor(SITE, { tier: "human", driverId: "claude-in-chrome" }, "export")).toBeNull();
    expect(ruleFor(SITE, { tier: "unknown", driverId: "claude-in-chrome" }, "export")).toBeNull();
    expect(allowedScopes("human", SITE, null)).toEqual(allowedScopes("human"));
  });
});

describe("limits the site sets", () => {
  it("cannot be loosened by any rule", () => {
    expect(lockedScope("delete")).toBe(true);
    expect(lockedScope("export")).toBe(false);
    expect(resolveRule(SITE, "recognised", "claude-in-chrome", "delete")).toBeNull();
    expect(decide("verified", remove, null, { choice: "allow", subject: "chatgpt-agent" })).toEqual({ outcome: "refuse", policy: "default/delete-people-only" });
  });

  it("are shown locked and refused when changed", () => {
    const row = ruleRows("recognised", SITE, "claude-in-chrome").find((r) => r.scope === "delete")!;
    expect(row).toMatchObject({ locked: true, choice: "never", own: false, options: null });
    expect(ruleChange(SITE, "claude-in-chrome", "delete", "allow").error).toMatch(/limit for every agent/);
    expect(ruleChange(SITE, "any-verified", "delete", null).error).toMatch(/limit for every agent/);
  });
});

describe("the Rules page", () => {
  it("shows an agent's own rules, and where the rest come from", () => {
    const rows = new Map(ruleRows("recognised", SITE, "claude-in-chrome").map((r) => [r.scope, r]));
    expect(rows.get("export")).toMatchObject({ choice: "allow", own: true, policy: "site/claude-in-chrome/export", base: { choice: "never", policy: "site/any-recognised/export" } });
    expect(rows.get("edit")).toMatchObject({ choice: "allow", own: false, policy: "site/any-recognised/edit" });
    expect(rows.get("view")).toMatchObject({ choice: "allow", own: false, policy: "default/view-open" });
    expect(rows.get("export")!.options!.ask).toMatchObject({ outcome: "ask", policy: "site/claude-in-chrome/export" });
    // A group falls back on the default.
    expect(ruleRows("recognised", SITE, "any-recognised").find((r) => r.scope === "export")).toMatchObject({ own: true, base: { outcome: "request_access" } });
    // People are never editable.
    expect(ruleRows("human", SITE, "people").every((r) => r.options === null)).toBe(true);
  });

  it("sums up overrides in the list of agents", () => {
    expect(ruleSummary("recognised")).toEqual({ label: "View", tone: "ask" });
    // View by default, plus export (its own rule) and edit (the group's).
    expect(ruleSummary("recognised", SITE, "claude-in-chrome")).toEqual({ label: "On", tone: "ok" });
    expect(ruleSummary("unknown-automation", SITE, "unnamed")).toEqual({ label: "Off", tone: "no" });
    expect(allowedScopes("recognised", SITE, "claude-in-chrome")).toEqual(["View", "Export", "Create & edit"]);
  });

  it("stores only what differs from what applies anyway", () => {
    // Comet follows the recognised group (never): choosing never again removes its own rule.
    expect(ruleChange(SITE, "comet", "export", "never")).toEqual({ error: null, scope: "export", choice: null });
    expect(ruleChange(SITE, "comet", "export", "ask")).toEqual({ error: null, scope: "export", choice: "ask" });
    // The group's default for export is to ask (the person grants access), so Ask is the default.
    expect(ruleChange(SITE, "any-recognised", "export", "ask")).toEqual({ error: null, scope: "export", choice: null });
    expect(ruleChange(SITE, "claude-in-chrome", "export", null)).toEqual({ error: null, scope: "export", choice: null });
  });

  it("refuses anything else", () => {
    expect(ruleChange(SITE, "people", "export", "allow").error).toMatch(/People keep their own roles/);
    expect(ruleChange(SITE, "comet", "teleport", "allow").error).toMatch(/not a kind of action/);
    expect(ruleChange(SITE, "comet", "export", "maybe").error).toMatch(/Allow, Ask or Never/);
  });
});
