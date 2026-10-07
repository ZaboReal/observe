import { makeReason } from "../detect/rules";
import type { RegistryIndex } from "../registry";
import type { ProbeResult } from "./automation";

/** WXT-built extensions announce each on-demand content script with `<extensionId>:<entry>:wxt:content-script-started`. */
const WXT = /^([a-p]{32}):([^:]+):wxt:content-script-started$/;

/**
 * Listens for `window.postMessage` and document CustomEvents that agent extensions send while they act.
 * Only the message `type` string is read, never the payload.
 */
export class MessageWatcher {
  private onMessage = (e: MessageEvent) => this.check(typeOf(e.data));
  private onCustom = (e: Event) => this.check(e.type);
  private seen = new Set<string>();

  constructor(
    private readonly registry: RegistryIndex,
    private readonly clock: () => number,
    private readonly onFound: (r: ProbeResult) => void,
    private readonly onExtension: (extensionId: string) => void,
  ) {}

  start(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("message", this.onMessage);
    // WXT also dispatches the announcement as a CustomEvent on document; the type is only known at runtime,
    // so listen for the announcements of known extensions explicitly.
    for (const [re] of this.registry.messageTypes) {
      const literal = /^\^([a-z0-9:_-]+)\$$/i.exec(re.source)?.[1];
      if (literal) document.addEventListener(literal, this.onCustom);
    }
  }

  stop(): void {
    if (typeof window === "undefined") return;
    window.removeEventListener("message", this.onMessage);
    for (const [re] of this.registry.messageTypes) {
      const literal = /^\^([a-z0-9:_-]+)\$$/i.exec(re.source)?.[1];
      if (literal) document.removeEventListener(literal, this.onCustom);
    }
  }

  private check(type: string | null): void {
    if (!type || type.length > 200) return;
    const wxt = WXT.exec(type);
    if (wxt?.[1]) this.onExtension(wxt[1]);
    for (const [re, id] of this.registry.messageTypes) {
      if (!re.test(type)) continue;
      const key = `artifact.message:${id}`;
      if (this.seen.has(key)) return;
      this.seen.add(key);
      this.onFound({ key, reason: makeReason("artifact.message", this.clock(), { detail: type.slice(0, 80), drivers: { [id]: 4 } }) });
      return;
    }
  }
}

function typeOf(data: unknown): string | null {
  if (data && typeof data === "object" && "type" in data) {
    const t = (data as { type: unknown }).type;
    return typeof t === "string" ? t : null;
  }
  return null;
}
