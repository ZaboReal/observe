import { EXPORT_CAP, entryLog, parseRange } from "@/lib/queries";

export const dynamic = "force-dynamic";

const HEADER = ["time", "agent", "tier", "user", "account", "action", "method", "path", "scope", "risk", "would_decide", "policy", "session"];

function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Entry log as JSON, or CSV with `?format=csv`. Takes the same filters as the page. */
export function GET(req: Request) {
  const url = new URL(req.url);
  const range = parseRange(url.searchParams.get("range") ?? undefined);
  const { lines, counts } = entryLog({
    range,
    sensitiveOnly: url.searchParams.get("sensitive") === "1",
    driverId: url.searchParams.get("driver") ?? undefined,
    outcome: url.searchParams.get("outcome") ?? undefined,
    limit: Math.min(EXPORT_CAP, Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || EXPORT_CAP))),
  });
  if (url.searchParams.get("format") !== "csv") return Response.json({ counts, lines });

  const rows = lines.map((l) =>
    [new Date(l.ts).toISOString(), l.driver, l.tier, l.email, l.account, l.action.id, l.action.method, l.action.path, l.action.scope, l.action.risk, l.outcome, l.policy, l.sessionId].map(cell).join(","),
  );
  return new Response([HEADER.join(","), ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="entry-log-${range}.csv"`,
    },
  });
}
