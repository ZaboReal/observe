import { evidenceFor } from "@/lib/classify";
import { loadResults, summarise } from "@/lib/results";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Sessions the sensor reported, with what decided each verdict: for the check tool and debugging.
 * Labelled test runs saved before a restart are included (`source: "saved"`).
 * `?since=<ms epoch>` keeps sessions started after a time, `?label=playwright` filters by test label,
 * `?evidence=1` adds the state Jev was given (live sessions only).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = Number(url.searchParams.get("since")) || 0;
  const label = url.searchParams.get("label");
  const withEvidence = url.searchParams.get("evidence") === "1";

  const live = [...store.sensor.values()]
    .filter((r) => r.session.startedAt >= since)
    .map((r) => ({ ...summarise(r), source: "live" as const, ...(withEvidence ? { evidence: evidenceFor(r) } : {}) }));
  const liveIds = new Set(live.map((s) => s.id));
  const saved = (await loadResults(since)).filter((s) => !liveIds.has(s.id)).map((s) => ({ ...s, jevPending: false, source: "saved" as const }));

  const sessions = [...live, ...saved]
    .filter((s) => !label || s.label === label)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 1000);
  return Response.json({ sessions });
}
