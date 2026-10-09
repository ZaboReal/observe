import { observe } from "@observe/next/server";

import { INVOICES, toCsv } from "@/lib/invoices";

/**
 * Export all invoices as CSV. The sensor adds `x-observe-token`; the console says who is asking. Observe mode: the
 * answer is shown and logged, never acted on (`decision.wouldBlock` is what the rules would do).
 *
 * Agent pricing: when the console prices this export for agents, `decision.price` says how much. With
 * OBSERVE_CHARGE_AGENTS=1 this example acts on it the simplest way, a 402 Payment Required naming the price; a real
 * app might take an API key or add it to the agent operator's invoice instead. People always get the file.
 */
export async function POST(request: Request) {
  const decision = await observe.check("export_invoices", { request });
  if (process.env.OBSERVE_CHARGE_AGENTS === "1" && decision.outcome === "bill" && decision.price) {
    return Response.json({ decision, error: `Payment required: agents pay ${decision.price.display} per export. People export for free.` }, { status: 402 });
  }
  return Response.json({ decision, filename: "acme-invoices.csv", csv: toCsv(INVOICES) });
}
