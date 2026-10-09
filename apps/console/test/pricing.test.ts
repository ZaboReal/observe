import { describe, expect, it } from "vitest";

import { formatPrice, formatTotal, parsePrice } from "../src/lib/money";
import { decide } from "../src/lib/policy";
import { priceFor, setLocalPrice, setStoredPrices } from "../src/lib/pricing";
import type { ActionDef } from "../src/lib/types";

const action = (id: string, scope: ActionDef["scope"], risk: ActionDef["risk"] = "medium"): ActionDef => ({ id, label: id, method: "POST", path: "/", route: "/", scope, risk });

const exportCsv = action("export_csv", "export");
const readPage = action("read_page", "view", "low");
const invite = action("invite_user", "invite");
const remove = action("delete_workspace", "delete", "critical");

describe("agent pricing in the rules", () => {
  it("bills a recognised agent for what it could have done or asked for", () => {
    expect(decide("recognised", exportCsv, 250_000)).toEqual({ outcome: "bill", policy: "pricing/export_csv", price: 250_000 });
    expect(decide("recognised", readPage, 2_000).outcome).toBe("bill");
    expect(decide("verified", exportCsv, 250_000).outcome).toBe("bill");
  });

  it("never charges people, undecided sessions or unknown automation", () => {
    expect(decide("human", exportCsv, 250_000)).toEqual({ outcome: "admit", policy: "people/role" });
    expect(decide("unknown", readPage, 2_000).outcome).toBe("admit");
    expect(decide("unknown-automation", exportCsv, 250_000).outcome).toBe("refuse");
  });

  it("never overrides asking the person or a refusal", () => {
    expect(decide("recognised", invite, 1_000_000).outcome).toBe("ask");
    expect(decide("verified", invite, 1_000_000).outcome).toBe("bill");
    expect(decide("verified", remove, 1_000_000).outcome).toBe("refuse");
  });

  it("is free without a price", () => {
    expect(decide("recognised", readPage, null).outcome).toBe("admit");
    expect(decide("recognised", exportCsv).outcome).toBe("request_access");
  });
});

describe("prices", () => {
  it("come from the database per site, with local writes on top", () => {
    setStoredPrices([{ site: "shop", action_id: "export_csv", amount_micro: "250000", currency: "USD" }]);
    expect(priceFor("shop", "export_csv")).toBe(250_000);
    expect(priceFor("other", "export_csv")).toBeNull();
    setLocalPrice("shop", "export_csv", null);
    expect(priceFor("shop", "export_csv")).toBeNull();
  });

  it("read and print as dollars", () => {
    expect(parsePrice("0.25")).toBe(250_000);
    expect(parsePrice("$1")).toBe(1_000_000);
    expect(parsePrice(".002")).toBe(2_000);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("0")).toBeNull();
    expect(parsePrice("abc")).toBeUndefined();
    expect(parsePrice("101")).toBeUndefined();
    expect(formatPrice(250_000)).toBe("$0.25");
    expect(formatPrice(2_000)).toBe("$0.002");
    expect(formatPrice(12_000_000)).toBe("$12");
    expect(formatTotal(1_234_560_000)).toBe("$1,234.56");
  });
});
