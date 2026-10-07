import { makeReason } from "../detect/rules";
import type { ProbeResult } from "./automation";

type ModelContextLike = EventTarget & { registerTool?: unknown };

/**
 * WebMCP signals. The page cannot learn which agent calls a tool, but a tool activation or a form
 * submitted with `SubmitEvent.agentInvoked` proves an agent acted.
 */
export class WebMcpWatcher {
  private ctx: ModelContextLike | null = null;
  private onTool = () => this.report("webmcp.tool", "toolactivated");
  private onSubmit = (e: Event) => {
    if ((e as SubmitEvent & { agentInvoked?: boolean }).agentInvoked === true) this.report("webmcp.form", "agentInvoked submit");
  };

  constructor(
    private readonly clock: () => number,
    private readonly onFound: (r: ProbeResult) => void,
  ) {}

  /** True when the browser exposes the WebMCP API (support, not use). */
  static supported(): boolean {
    try {
      const d = document as Document & { modelContext?: ModelContextLike };
      const n = navigator as Navigator & { modelContext?: ModelContextLike };
      return Boolean(d.modelContext ?? n.modelContext);
    } catch {
      return false;
    }
  }

  start(): void {
    if (typeof document === "undefined") return;
    try {
      const d = document as Document & { modelContext?: ModelContextLike };
      const n = navigator as Navigator & { modelContext?: ModelContextLike };
      this.ctx = d.modelContext ?? n.modelContext ?? null;
      this.ctx?.addEventListener?.("toolactivated", this.onTool);
    } catch {
      this.ctx = null;
    }
    document.addEventListener("submit", this.onSubmit, { capture: true, passive: true });
  }

  stop(): void {
    try {
      this.ctx?.removeEventListener?.("toolactivated", this.onTool);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") document.removeEventListener("submit", this.onSubmit, { capture: true });
  }

  private report(rule: "webmcp.tool" | "webmcp.form", detail: string): void {
    const t = this.clock();
    this.onFound({ key: `${rule}:${Math.round(t)}`, reason: makeReason(rule, t, { detail }) });
  }
}
