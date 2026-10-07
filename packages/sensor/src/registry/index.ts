import { DRIVERS } from "./drivers";
import type { CssProbe, DomSignature, DriverSignature } from "./types";

export type { DriverSignature, DomSignature, MechanicsProfile, PresenceSignature, CssProbe } from "./types";
export { DRIVERS };

/** Lookup tables for one class of DOM marker. */
export interface DomIndex {
  ids: Map<string, string>;
  idPrefixes: Array<[string, string]>;
  classes: Map<string, string>;
  attributes: Map<string, string>;
  tags: Map<string, string>;
  /** One CSS selector matching any marker in this index ('' when empty). */
  selector: string;
}

/** Lookup tables built once from the driver list. */
export interface RegistryIndex {
  byId: Map<string, DriverSignature>;
  active: DomIndex;
  residue: DomIndex;
  presence: DomIndex;
  extensionIds: Map<string, string>;
  windowGlobals: Map<string, string>;
  presenceGlobals: Map<string, string>;
  documentGlobals: Map<string, string>;
  stackMarkers: Array<[string, string]>;
  messageTypes: Array<[RegExp, string]>;
  consoleMarkers: Array<[string, string]>;
  keyframes: Map<string, string>;
  userAgent: Array<[RegExp, string]>;
  declaredUserAgent: Array<[RegExp, string]>;
  navigatorProps: Map<string, string>;
  brands: Map<string, string>;
  cssProbes: Array<[CssProbe, string]>;
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`).replace(/^(\d)/, "\\3$1 ");
}

function emptyDomIndex(): DomIndex {
  return { ids: new Map(), idPrefixes: [], classes: new Map(), attributes: new Map(), tags: new Map(), selector: "" };
}

function addDom(idx: DomIndex, dom: DomSignature | undefined, id: string, extraIds: string[] = []): void {
  for (const v of [...(dom?.ids ?? []), ...extraIds]) idx.ids.set(v, id);
  for (const v of dom?.idPrefixes ?? []) idx.idPrefixes.push([v, id]);
  for (const v of dom?.classes ?? []) idx.classes.set(v, id);
  for (const v of dom?.attributes ?? []) idx.attributes.set(v.toLowerCase(), id);
  for (const v of dom?.tags ?? []) idx.tags.set(v.toLowerCase(), id);
}

function finishDom(idx: DomIndex): void {
  const parts: string[] = [];
  for (const v of idx.ids.keys()) parts.push(`#${cssEscape(v)}`);
  for (const [v] of idx.idPrefixes) parts.push(`[id^="${v.replace(/"/g, '\\"')}"]`);
  for (const v of idx.classes.keys()) parts.push(`.${cssEscape(v)}`);
  for (const v of idx.attributes.keys()) parts.push(`[${cssEscape(v)}]`);
  for (const v of idx.tags.keys()) parts.push(cssEscape(v));
  idx.selector = parts.join(",");
}

/** Which driver an element belongs to under one DOM index, and the marker that matched. */
export function matchDom(idx: DomIndex, el: Element): { id: string; what: string } | null {
  if (el.id) {
    const d = idx.ids.get(el.id);
    if (d) return { id: d, what: `#${el.id}` };
    for (const [prefix, id] of idx.idPrefixes) if (el.id.startsWith(prefix)) return { id, what: `#${el.id}` };
  }
  const classList = el.classList ? Array.from(el.classList) : [];
  for (const c of classList) {
    const d = idx.classes.get(c);
    if (d) return { id: d, what: `.${c}` };
  }
  for (const [a, d] of idx.attributes) if (el.hasAttribute(a)) return { id: d, what: `[${a}]` };
  const d = idx.tags.get(el.localName);
  if (d) return { id: d, what: el.localName };
  return null;
}

function compile(patterns: string[] | undefined, id: string, into: Array<[RegExp, string]>): void {
  for (const v of patterns ?? []) {
    try {
      into.push([new RegExp(v), id]);
    } catch {
      /* skip invalid pattern */
    }
  }
}

export function buildIndex(drivers: readonly DriverSignature[] = DRIVERS): RegistryIndex {
  const idx: RegistryIndex = {
    byId: new Map(),
    active: emptyDomIndex(),
    residue: emptyDomIndex(),
    presence: emptyDomIndex(),
    extensionIds: new Map(),
    windowGlobals: new Map(),
    presenceGlobals: new Map(),
    documentGlobals: new Map(),
    stackMarkers: [],
    messageTypes: [],
    consoleMarkers: [],
    keyframes: new Map(),
    userAgent: [],
    declaredUserAgent: [],
    navigatorProps: new Map(),
    brands: new Map(),
    cssProbes: [],
  };
  for (const d of drivers) {
    idx.byId.set(d.id, d);
    addDom(idx.active, d.activeDom, d.id);
    addDom(idx.residue, d.residueDom, d.id, d.styleIds);
    addDom(idx.presence, d.presence?.dom, d.id, d.presence?.styleIds);
    for (const v of d.extensionIds ?? []) idx.extensionIds.set(v, d.id);
    for (const v of d.windowGlobals ?? []) idx.windowGlobals.set(v, d.id);
    for (const v of d.presence?.windowGlobals ?? []) idx.presenceGlobals.set(v, d.id);
    for (const v of d.documentGlobals ?? []) idx.documentGlobals.set(v, d.id);
    for (const v of d.stackMarkers ?? []) idx.stackMarkers.push([v, d.id]);
    compile(d.messageTypes, d.id, idx.messageTypes);
    for (const v of d.consoleMarkers ?? []) idx.consoleMarkers.push([v, d.id]);
    for (const v of d.keyframes ?? []) idx.keyframes.set(v, d.id);
    compile(d.userAgent, d.id, idx.userAgent);
    compile(d.declaredUserAgent, d.id, idx.declaredUserAgent);
    for (const v of d.navigatorProps ?? []) idx.navigatorProps.set(v, d.id);
    for (const v of d.brands ?? []) idx.brands.set(v, d.id);
    for (const p of d.presence?.cssProbes ?? []) idx.cssProbes.push([p, d.id]);
  }
  finishDom(idx.active);
  finishDom(idx.residue);
  finishDom(idx.presence);
  return idx;
}
