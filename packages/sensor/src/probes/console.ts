import { makeReason } from "../detect/rules";
import type { RegistryIndex } from "../registry";
import type { ProbeResult } from "./automation";

const METHODS = ["log", "info", "debug"] as const;
type Method = (typeof METHODS)[number];

/**
 * Several frameworks log fixed strings from code they evaluate in the page's main world
 * ("Removing N browser-use highlight elements", "[v3-piercer] installed", "[WDIO]" …). Those calls go
 * through the page's console object, so a thin wrapper sees them. Only the first string argument is read,
 * and only to test for registry markers; nothing is stored or sent.
 */
export class ConsoleWatcher {
  private originals = new Map<Method, (...args: unknown[]) => void>();
  private seen = new Set<string>();

  constructor(
    private readonly registry: RegistryIndex,
    private readonly clock: () => number,
    private readonly onFound: (r: ProbeResult) => void,
  ) {}

  start(): void {
    if (typeof console === "undefined" || this.registry.consoleMarkers.length === 0 || this.originals.size) return;
    for (const m of METHODS) {
      const original = console[m] as (...args: unknown[]) => void;
      if (typeof original !== "function") continue;
      this.originals.set(m, original);
      const self = this;
      const wrapped = function (this: unknown, ...args: unknown[]) {
        try {
          self.check(args);
        } catch {
          /* never break logging */
        }
        return original.apply(this, args);
      };
      try {
        console[m] = wrapped as Console[Method];
      } catch {
        this.originals.delete(m);
      }
    }
  }

  stop(): void {
    for (const [m, original] of this.originals) {
      try {
        console[m] = original as Console[Method];
      } catch {
        /* ignore */
      }
    }
    this.originals.clear();
  }

  private check(args: unknown[]): void {
    let text = "";
    for (const a of args.slice(0, 3)) if (typeof a === "string") text += a.slice(0, 200) + " ";
    if (!text) return;
    for (const [marker, id] of this.registry.consoleMarkers) {
      if (!text.includes(marker)) continue;
      const key = `artifact.console:${id}`;
      if (this.seen.has(key)) return;
      this.seen.add(key);
      this.onFound({ key, reason: makeReason("artifact.console", this.clock(), { detail: marker, drivers: { [id]: 6 } }) });
      return;
    }
  }
}
