import { observe } from "@observe/next/server";

import { INVOICES, toCsv } from "@/lib/invoices";

/**
 * Export all invoices as CSV. The sensor adds `x-observe-token`; the console says who is asking. Observe mode: the
 * answer is shown and logged, never acted on (`decision.wouldBlock` is what the rules would do).
 */
export async function POST(request: Request) {
  const decision = await observe.check("export_invoices", { request });
  return Response.json({ decision, filename: "acme-invoices.csv", csv: toCsv(INVOICES) });
}
