import type { ObserveDecision } from "@observe/next";

import { decisionDetail, describeDecision } from "@/lib/describe";

/** What Observe said about the last protected request. */
export function Decision({ decision }: { decision: ObserveDecision }) {
  return (
    <div className={`decision ${decision.wouldBlock ? "blocked" : decision.verdict}`} role="status">
      <strong>{describeDecision(decision)}</strong>
      <span>{decisionDetail(decision)}</span>
    </div>
  );
}
