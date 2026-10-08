import { evidenceFor } from "@/lib/classify";
import { exactMatch } from "@/lib/passport";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Sessions the sensor reported, with what decided each verdict: for the check tool and debugging.
 * `?since=<ms epoch>` keeps sessions started after a time, `?label=playwright` filters by test label,
 * `?evidence=1` adds the state Jev was given.
 */
export function GET(req: Request) {
  const url = new URL(req.url);
  const since = Number(url.searchParams.get("since")) || 0;
  const label = url.searchParams.get("label");
  const withEvidence = url.searchParams.get("evidence") === "1";
  const sessions = [...store.sensor.values()]
    .filter((r) => r.session.startedAt >= since && (!label || r.label === label))
    .sort((a, b) => b.session.startedAt - a.session.startedAt)
    .slice(0, 500)
    .map((r) => ({
      id: r.session.id,
      label: r.label,
      startedAt: r.session.startedAt,
      lastSeen: r.lastSeen,
      actions: r.actionCount,
      decision: {
        verdict: r.session.verdict,
        tier: r.session.tier,
        driverId: r.session.driverId,
        confidence: r.session.confidence,
        decidedBy: r.session.decidedBy ?? null,
      },
      exactMatch: exactMatch(r),
      jev: r.jev,
      jevPending: r.jevStatus.inFlight || (r.jevStatus.key !== `${r.actionCount}|${r.observations.size}` && !r.jevStatus.error),
      jevError: r.jevStatus.error,
      rules: r.rules,
      ...(withEvidence ? { evidence: evidenceFor(r) } : {}),
    }));
  return Response.json({ sessions });
}
