import { listSessions, parseRange } from "@/lib/queries";
import type { Verdict } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Recent sessions as JSON: `?verdict=agent&driver=claude-in-chrome&account=acct_northwind&q=morgan&range=24h&limit=50`. */
export function GET(req: Request) {
  const url = new URL(req.url);
  const verdict = url.searchParams.get("verdict");
  const result = listSessions({
    verdict: verdict === "human" || verdict === "agent" || verdict === "unknown" ? (verdict as Verdict) : "all",
    driverId: url.searchParams.get("driver") ?? undefined,
    accountId: url.searchParams.get("account") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    range: parseRange(url.searchParams.get("range") ?? undefined),
    limit: Math.min(500, Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 100))),
  });
  return Response.json(result);
}
