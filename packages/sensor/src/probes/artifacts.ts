import { makeReason } from "../detect/rules";
import { matchDom, type DomIndex, type RegistryIndex } from "../registry";
import type { ProbeResult } from "./automation";

const EXT_URL = /(?:chrome|moz|safari-web|ms-browser)-extension:\/\/([a-z0-9-]{8,64})\//gi;
export const IGNORE_ATTR = "data-observe-ignore";

export interface ArtifactEvents {
  onFound: (r: ProbeResult) => void;
  onGone: (key: string) => void;
  /** An extension we do not know injected something. Reported with its id for discovery (lab mode). */
  onUnknownExtension?: (id: string) => void;
}

type Kind = "active" | "residue" | "presence";

const RULE: Record<Kind, "artifact.active" | "artifact.residue" | "env.installed"> = {
  active: "artifact.active",
  residue: "artifact.residue",
  presence: "env.installed",
};
const DRIVER_WEIGHT: Record<Kind, number> = { active: 6, residue: 3, presence: 1 };

/**
 * Watches the DOM for elements that agent products inject and for `chrome-extension://` URLs from known
 * agent extensions. Active overlays count only while present; installed-only markers only help naming.
 */
export class ArtifactWatcher {
  private observer: MutationObserver | null = null;
  private present = new Map<string, Element>();
  private pending = false;
  private queue: Node[] = [];
  private seenUnknown = new Set<string>();

  constructor(
    private readonly registry: RegistryIndex,
    private readonly clock: () => number,
    private readonly events: ArtifactEvents,
  ) {}

  start(): void {
    if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
    this.scan(document.documentElement);
    this.observer = new MutationObserver((records) => {
      let removed = false;
      for (const rec of records) {
        if (rec.type === "childList") {
          rec.addedNodes.forEach((n) => this.queue.push(n));
          if (rec.removedNodes.length) removed = true;
        } else if (rec.type === "attributes" && rec.target instanceof Element) {
          this.queue.push(rec.target);
          removed = true;
        }
      }
      if (removed) this.recheckPresent();
      this.schedule();
    });
    // Many agents tag existing elements instead of inserting new ones, so watch every registry attribute too.
    const attributeFilter = [
      "class",
      "id",
      ...this.registry.active.attributes.keys(),
      ...this.registry.residue.attributes.keys(),
      ...this.registry.presence.attributes.keys(),
    ];
    this.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.queue = [];
  }

  private schedule(): void {
    if (this.pending) return;
    this.pending = true;
    const run = () => {
      this.pending = false;
      const nodes = this.queue;
      this.queue = [];
      // A large render: one document-wide pass is cheaper than hundreds of subtree passes.
      if (nodes.length > 300) {
        this.scan(document.documentElement);
        return;
      }
      const set = new Set(nodes);
      for (const n of nodes) {
        if (n.nodeType !== 1) continue;
        // Skip nodes whose parent is also queued; scanning the parent covers them.
        if (n.parentNode && set.has(n.parentNode)) continue;
        this.scan(n as Element);
      }
    };
    if (typeof queueMicrotask === "function") queueMicrotask(run);
    else Promise.resolve().then(run);
  }

  private scan(root: Element): void {
    if (root.closest?.(`[${IGNORE_ATTR}]`)) return;
    const t = this.clock();
    const kinds: Array<[Kind, DomIndex]> = [
      ["active", this.registry.active],
      ["residue", this.registry.residue],
      ["presence", this.registry.presence],
    ];
    for (const [kind, idx] of kinds) {
      if (!idx.selector) continue;
      for (const el of this.matchAll(root, idx.selector)) {
        if (el.closest(`[${IGNORE_ATTR}]`)) continue;
        this.found(el, kind, idx, t);
      }
    }
    this.scanPatterns(root, t);
    this.scanExtensionUrls(root, t);
  }

  /** Artifacts with random ids that a selector cannot express. */
  private scanPatterns(root: Element, t: number): void {
    const candidates: Element[] = [];
    if (root.localName === "script" || root.localName === "div") candidates.push(root);
    try {
      root.querySelectorAll("script[class][id],div[id][style]").forEach((el) => candidates.push(el));
    } catch {
      /* ignore */
    }
    for (const el of candidates) {
      const hit = patternArtifact(el);
      if (!hit) continue;
      const key = `artifact.active:${hit.id}`;
      if (this.present.has(key)) continue;
      // These elements remove themselves within milliseconds, so they never count as "still present".
      this.present.set(key, el);
      this.events.onFound({ key, reason: makeReason("artifact.active", t, { detail: hit.what, drivers: { [hit.id]: 6 } }) });
    }
  }

  private matchAll(root: Element, selector: string): Element[] {
    const out: Element[] = [];
    try {
      if (root.matches(selector)) out.push(root);
      root.querySelectorAll(selector).forEach((el) => out.push(el));
    } catch {
      /* invalid selector in a custom registry */
    }
    return out;
  }

  private found(el: Element, kind: Kind, idx: DomIndex, t: number): void {
    const match = matchDom(idx, el);
    if (!match) return;
    const key = `${RULE[kind]}:${match.id}`;
    const known = this.present.has(key);
    this.present.set(key, el);
    if (known) return;
    this.events.onFound({
      key,
      reason: makeReason(RULE[kind], t, { detail: match.what, drivers: { [match.id]: DRIVER_WEIGHT[kind] } }),
    });
  }

  /** Overlays come and go around each agent action. Report when the last matching element leaves the page. */
  private recheckPresent(): void {
    const idx = this.registry.active;
    for (const [key, el] of this.present) {
      if (!key.startsWith("artifact.active:")) continue;
      if (el.isConnected && matchDom(idx, el)) continue;
      const driverId = key.slice("artifact.active:".length);
      const replacement = this.findReplacement(driverId);
      if (replacement) {
        this.present.set(key, replacement);
        continue;
      }
      this.present.delete(key);
      this.events.onGone(key);
    }
  }

  private findReplacement(driverId: string): Element | null {
    const idx = this.registry.active;
    try {
      for (const el of Array.from(document.querySelectorAll(idx.selector))) {
        if (!el.closest(`[${IGNORE_ATTR}]`) && matchDom(idx, el)?.id === driverId) return el;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private scanExtensionUrls(root: Element, t: number): void {
    const urls: string[] = [];
    const collect = (el: Element) => {
      for (const name of ["src", "href", "style", "data"]) {
        const v = el.getAttribute(name);
        if (v && v.includes("-extension://")) urls.push(v);
      }
      if (el.localName === "style" && el.textContent?.includes("-extension://")) urls.push(el.textContent.slice(0, 4000));
    };
    collect(root);
    try {
      root.querySelectorAll("[src*='-extension://'],[href*='-extension://'],[style*='-extension://'],[data*='-extension://'],style").forEach(collect);
    } catch {
      /* ignore */
    }
    for (const u of urls) {
      EXT_URL.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = EXT_URL.exec(u))) this.extension((m[1] ?? "").toLowerCase(), t, root);
    }
  }

  /** Report a known agent extension seen in the page (by URL or by announcement). */
  extension(extId: string, t: number, el: Element | null = null): void {
    const driver = this.registry.extensionIds.get(extId);
    if (driver) {
      const key = `artifact.extension:${driver}`;
      if (this.present.has(key)) return;
      this.present.set(key, el ?? document.documentElement);
      this.events.onFound({ key, reason: makeReason("artifact.extension", t, { detail: extId, drivers: { [driver]: 4 } }) });
    } else if (!this.seenUnknown.has(extId)) {
      this.seenUnknown.add(extId);
      this.events.onUnknownExtension?.(extId);
    }
  }
}

/**
 * Patchright inserts a self-removing <script class="<40 hex>" id="<44 hex>"> to run init scripts;
 * nodriver flashes a div#<16 hex> red dot with z-index 99999999 before each Element.click().
 */
export function patternArtifact(el: Element): { id: string; what: string } | null {
  if (el.localName === "script" && /^[0-9a-f]{40}$/.test(el.getAttribute("class") ?? "") && /^[0-9a-f]{44}$/.test(el.id)) {
    return { id: "patchright", what: "self-removing init <script>" };
  }
  if (el.localName === "div" && /^[0-9a-f]{16}$/.test(el.id) && /z-index:\s*99999999\b/.test(el.getAttribute("style") ?? "")) {
    return { id: "nodriver", what: "click marker div" };
  }
  return null;
}

/** Keyframe names agents add to the page's stylesheets (nodriver inserts into an existing sheet). */
export function scanKeyframes(registry: RegistryIndex, t: number): ProbeResult[] {
  if (typeof document === "undefined" || registry.keyframes.size === 0) return [];
  const out: ProbeResult[] = [];
  const seen = new Set<string>();
  for (const sheet of Array.from(document.styleSheets ?? [])) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet
    }
    const n = rules.length;
    const idx = n <= 40 ? Array.from({ length: n }, (_, i) => i) : [...Array.from({ length: 10 }, (_, i) => i), ...Array.from({ length: 30 }, (_, i) => n - 30 + i)];
    for (const i of idx) {
      const rule = rules[i] as CSSKeyframesRule | undefined;
      const name = rule && "name" in rule ? rule.name : undefined;
      const id = name ? registry.keyframes.get(name) : undefined;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ key: `artifact.residue:${id}`, reason: makeReason("artifact.residue", t, { detail: `@keyframes ${name}`, drivers: { [id]: 3 } }) });
    }
  }
  return out;
}
