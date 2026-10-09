import { observe } from "@observe/next/server";

import { INVOICES, toCsv } from "@/lib/invoices";

/**
 * Export all invoices as CSV. The sensor adds `x-observe-token`; the console says who is asking. Observe mode: the
 * answer is shown and logged, never acted on (`decision.wouldBlock` is what the rules would do).
 *
 * Agent billing: when the console prices this export for the agent asking, `decision.outcome` is `bill` and
 * `decision.price` says how much. OBSERVE_CHARGE_AGENTS picks how this example acts on it:
 *   invoice  export, and tell the agent what it was billed (the console keeps the charge on record)
 *   402      answer 402 Payment Required with the price instead of the file
 */
export async function POST(request: Request) {
  const decision = await observe.check("export_invoices", { request });
  const mode = process.env.OBSERVE_CHARGE_AGENTS;
  const billed = decision.outcome === "bill" && decision.price ? decision.price : null;
  if (billed && (mode === "402" || mode === "1")) {
    return Response.json({ decision, error: `Payment required: this export costs ${billed.display}.` }, { status: 402 });
  }
  const charge = billed && mode === "invoice" ? { display: billed.display, to: decision.driver?.name ?? "the agent" } : null;
  return Response.json({ decision, charge, filename: "acme-invoices.csv", csv: toCsv(INVOICES) });
}
