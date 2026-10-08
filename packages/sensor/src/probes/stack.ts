import { makeReason } from "../detect/rules";
import { matchMarkers, type RegistryIndex } from "../registry";
import type { ProbeResult } from "./automation";

type Observe = MutationObserver["observe"];

/**
 * Frameworks that evaluate code in the page's main world name it in stack traces: Puppeteer's `pptr:` source URLs
 * carry the caller's file path, so Chrome DevTools MCP's DOM-settle wait shows up as
 * `pptr:evaluateHandle;WaitForHelper.waitForStableDom (…/chrome-devtools-mcp/…)`. That wait starts a MutationObserver
 * after every action, so a thin wrapper around `MutationObserver.prototype.observe` reads the caller's stack.
 * Only registry stack markers are looked for; nothing is stored or sent but the driver id and the marker.
 */
export class StackWatcher {
  private original: Observe | null = null;
  private seen = new Set<string>();

  constructor(
    private readonly registry: RegistryIndex,
    private readonly clock: () => number,
    private readonly onFound: (r: ProbeResult) => void,
  ) {}

  start(): void {
    if (typeof MutationObserver === "undefined" || this.registry.stackMarkers.length === 0 || this.original) return;
    const proto = MutationObserver.prototype;
    const original = proto.observe;
    if (typeof original !== "function") return;
    const self = this;
    const wrapped = function (this: MutationObserver, ...args: Parameters<Observe>) {
      try {
        self.check();
      } catch {
        /* never break the page's observers */
      }
      return original.apply(this, args);
    };
    try {
      proto.observe = wrapped;
      this.original = original;
    } catch {
      /* frozen prototype */
    }
  }

  stop(): void {
    if (!this.original) return;
    try {
      MutationObserver.prototype.observe = this.original;
    } catch {
      /* ignore */
    }
    this.original = null;
  }

  private check(): void {
    let stack = "";
    try {
      stack = new Error().stack ?? "";
    } catch {
      return;
    }
    if (!stack) return;
    for (const [id, marker] of matchMarkers(this.registry, this.registry.stackMarkers, stack)) {
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      this.onFound({ key: `env.stack-marker:${id}`, reason: makeReason("env.stack-marker", this.clock(), { detail: marker, drivers: { [id]: 6 } }) });
    }
  }
}
