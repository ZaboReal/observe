import { makeReason } from "../detect/rules";
import { matchMarkers, type RegistryIndex } from "../registry";
import type { Reason } from "../types";

export interface ProbeResult {
  key: string;
  reason: Reason;
}

interface UaBrand {
  brand: string;
  version: string;
}

function hasProp(obj: object, name: string): boolean {
  try {
    return name in obj;
  } catch {
    return false;
  }
}

/** Checks for automation frameworks and agent user agents, and identifies the browser for driver naming. */
export function probeAutomation(registry: RegistryIndex, t: number): ProbeResult[] {
  const out: ProbeResult[] = [];
  if (typeof window === "undefined") return out;

  try {
    if (navigator.webdriver === true) out.push({ key: "env.webdriver", reason: makeReason("env.webdriver", t) });
  } catch {
    /* ignore */
  }

  const globals = new Map<string, string[]>();
  const note = (id: string, name: string) => globals.set(id, [...(globals.get(id) ?? []), name]);
  for (const [name, id] of registry.windowGlobals) if (hasProp(window, name)) note(id, name);
  for (const [name, id] of registry.documentGlobals) if (hasProp(document, name)) note(id, `document.${name}`);
  // ChromeDriver injects cdc_ keys; patched builds rename them but keep the shape.
  try {
    for (const k of Object.keys(document)) if (/^\$?cdc_/.test(k)) note("selenium", `document.${k}`);
    for (const k of Object.getOwnPropertyNames(window)) {
      if (/^[a-z]{3}_[a-zA-Z0-9]{22}_(Array|Object|Promise|Proxy|Symbol|JSON|Window)$/.test(k)) note("selenium", k);
    }
  } catch {
    /* ignore */
  }
  for (const [id, names] of globals) {
    const min = registry.byId.get(id)?.minGlobalMatches ?? 1;
    if (new Set(names).size < min) continue;
    out.push({
      key: `env.automation-global:${id}`,
      reason: makeReason("env.automation-global", t, { detail: names.slice(0, 3).join(", "), drivers: { [id]: 6 } }),
    });
  }

  let ua = "";
  try {
    ua = navigator.userAgent;
  } catch {
    /* ignore */
  }
  for (const [re, id] of registry.declaredUserAgent) {
    if (re.test(ua)) out.push({ key: `env.agent-ua:${id}`, reason: makeReason("env.agent-ua", t, { detail: re.source.trim(), drivers: { [id]: 6 } }) });
  }

  for (const [name, id] of registry.presenceGlobals) {
    if (hasProp(window, name) && !out.some((o) => o.key === `env.installed:${id}`)) {
      out.push({ key: `env.installed:${id}`, reason: makeReason("env.installed", t, { detail: name, drivers: { [id]: 1 } }) });
    }
  }

  out.push(...probeIntegrity(t), ...probeWrappers(registry, t));

  const browser = (id: string, detail: string) => {
    if (!out.some((o) => o.key === `env.browser:${id}`)) {
      out.push({ key: `env.browser:${id}`, reason: makeReason("env.browser", t, { detail, drivers: { [id]: 1 } }) });
    }
  };
  for (const [re, id] of registry.userAgent) if (re.test(ua)) browser(id, re.source);
  for (const [name, id] of registry.navigatorProps) if (hasProp(navigator, name)) browser(id, `navigator.${name}`);
  const brands = readBrands();
  for (const { brand } of brands ?? []) {
    if (brand === "HeadlessChrome") out.push({ key: "env.agent-ua:headless-chrome", reason: makeReason("env.agent-ua", t, { detail: "HeadlessChrome brand", drivers: { "headless-chrome": 6 } }) });
    const id = registry.brands.get(brand);
    if (id) browser(id, brand);
  }

  const bindings = cdpBindings();
  if (bindings.length) out.push({ key: "env.cdp-binding", reason: makeReason("env.cdp-binding", t, { detail: bindings.slice(0, 3).join(", ") }) });
  const cli = devtoolsCommandLine();
  if (cli) out.push({ key: "env.devtools-api", reason: makeReason("env.devtools-api", t, { detail: cli, drivers: { "browser-use": 1 } }) });

  const mismatch = uaMismatch(ua, brands);
  if (mismatch) out.push({ key: "env.ua-mismatch", reason: makeReason("env.ua-mismatch", t, { detail: mismatch }) });
  return out;
}

function readBrands(): UaBrand[] | null {
  try {
    const data = (navigator as Navigator & { userAgentData?: { brands?: UaBrand[] } }).userAgentData;
    return data?.brands ? [...data.brands] : null;
  } catch {
    return null;
  }
}

const GREASE_CHARS = [" ", "(", ":", "-", ".", "/", ")", ";", "=", "?", "_"];
const GREASE_VERSIONS = ["8", "99", "24"];
const ORDERS3 = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/** Chromium's GREASE brand for a major version (components/embedder_support/user_agent_utils.cc). */
export function greaseBrand(major: number): UaBrand {
  return {
    brand: `Not${GREASE_CHARS[major % 11]}A${GREASE_CHARS[(major + 1) % 11]}Brand`,
    version: GREASE_VERSIONS[major % 3] as string,
  };
}

/**
 * Explains why the user agent and client hints disagree, or returns null.
 * Stealth plugins and agents that override the UA rarely reproduce Chromium's seeded brand order.
 */
export function uaMismatch(ua: string, brands: UaBrand[] | null): string | null {
  const iosOrFirefox = /iPhone|iPad|CriOS|EdgiOS|FxiOS|Firefox\//.test(ua);
  const claimsChromium = /Chrome\/\d+/.test(ua) && !iosOrFirefox;
  const secure = typeof window !== "undefined" && window.isSecureContext !== false;
  if (claimsChromium && secure && brands === null) return "Chromium UA without userAgentData";
  if (!brands || brands.length === 0) return null;
  const chromium = brands.find((b) => b.brand === "Chromium");
  if (!chromium) return null;
  const major = Number(chromium.version);
  const uaMajor = Number(/Chrome\/(\d+)/.exec(ua)?.[1] ?? NaN);
  if (Number.isFinite(uaMajor) && uaMajor !== major) return `UA Chrome/${uaMajor} but brands say ${major}`;
  if (/\bEdg\//.test(ua) && !brands.some((b) => b.brand === "Microsoft Edge")) return "UA claims Edge, brands do not";
  if (!Number.isFinite(major) || major < 130) return null;
  const grease = greaseBrand(major);
  const gi = brands.findIndex((b) => b.brand === grease.brand && b.version === grease.version);
  if (gi === -1) return `brand list lacks Chromium ${major}'s GREASE brand`;
  if (brands.length === 3) {
    const vendorIdx = brands.findIndex((b) => b !== brands[gi] && b !== chromium);
    const order = ORDERS3[major % 6] as number[];
    // Input list is [GREASE, Chromium, vendor]; output[order[i]] = input[i].
    if (gi !== order[0] || brands.indexOf(chromium) !== order[1] || vendorIdx !== order[2]) return `brand order is wrong for Chromium ${major}`;
  }
  return null;
}

function isNative(fn: unknown): boolean {
  if (typeof fn !== "function") return true;
  try {
    return /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(fn));
  } catch {
    return true;
  }
}

/**
 * Browser APIs that stealth kits patch to hide automation, and APIs that agent extensions wrap.
 * Stealth patches (webdriver, permissions.query) are strong; generic wrappers are weak because
 * analytics and polyfills also wrap things.
 */
export function probeIntegrity(t: number): ProbeResult[] {
  const out: ProbeResult[] = [];
  if (typeof navigator === "undefined") return out;
  const stealth: string[] = [];
  try {
    // A real browser defines webdriver on Navigator.prototype with a native getter, never on the instance.
    if (Object.getOwnPropertyDescriptor(navigator, "webdriver")) stealth.push("navigator.webdriver (own property)");
    const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), "webdriver");
    if (proto?.get && !isNative(proto.get)) stealth.push("navigator.webdriver getter");
  } catch {
    /* ignore */
  }
  try {
    const q = (navigator as Navigator & { permissions?: { query?: unknown } }).permissions?.query;
    if (q && !isNative(q)) stealth.push("navigator.permissions.query");
  } catch {
    /* ignore */
  }
  try {
    // Fingerprint kits (Steel, Crawlee) replace these; ordinary apps almost never do.
    if (!isNative(Object.keys) || !isNative(Object.getOwnPropertyNames)) stealth.push("Object.keys");
    // Stagehand v2's stealth script invents a navigator.headless property.
    if ("headless" in navigator) stealth.push("navigator.headless");
    // Real browsers expose window geometry as accessors; Crawlee pins them as own data properties.
    const iw = Object.getOwnPropertyDescriptor(window, "innerWidth");
    if (iw && "value" in iw) stealth.push("window.innerWidth (data property)");
    if (Object.prototype.hasOwnProperty.call(window, "SharedArrayBuffer") && (window as unknown as { SharedArrayBuffer?: unknown }).SharedArrayBuffer === undefined) {
      stealth.push("SharedArrayBuffer = undefined");
    }
    // puppeteer-extra-plugin-stealth's hard-coded 2020 plugin list (modern Chrome lists five PDF viewers).
    const names = Array.from(navigator.plugins ?? []).map((p) => p.name);
    if (names.includes("Native Client") || names.includes("Chrome PDF Plugin")) stealth.push("legacy plugin list");
  } catch {
    /* ignore */
  }
  if (stealth.length) out.push({ key: "env.patched-api", reason: makeReason("env.patched-api", t, { detail: stealth.join(", ") }) });

  const wrapped: string[] = [];
  try {
    if (typeof Element !== "undefined" && !isNative(Element.prototype.attachShadow)) wrapped.push("attachShadow");
    if (!isNative(Object.defineProperty)) wrapped.push("Object.defineProperty");
    if (typeof window !== "undefined" && !isNative(window.open)) wrapped.push("window.open");
    if (typeof customElements !== "undefined" && !isNative(customElements.define)) wrapped.push("customElements.define");
  } catch {
    /* ignore */
  }
  if (wrapped.length) out.push({ key: "env.modified-api", reason: makeReason("env.modified-api", t, { detail: wrapped.join(", ") }) });
  return out;
}

/** Built-ins that automation code replaces in the main world, read by `probeWrappers`. */
const WRAPPABLE: Array<[string, () => unknown]> = [
  ["Element.prototype.attachShadow", () => (typeof Element !== "undefined" ? Element.prototype.attachShadow : undefined)],
  ["customElements.define", () => (typeof customElements !== "undefined" ? customElements.define : undefined)],
  ["Object.defineProperty", () => Object.defineProperty],
  ["window.open", () => (typeof window !== "undefined" ? window.open : undefined)],
];

/**
 * Wrappers a known framework put around built-ins. WebdriverIO's BiDi preload script replaces attachShadow and
 * customElements.define with code that logs "[WDIO]"; the wrappers stay for the life of the page, so the sensor
 * finds them however late it loads.
 */
export function probeWrappers(registry: RegistryIndex, t: number): ProbeResult[] {
  if (registry.wrapperMarkers.length === 0) return [];
  const found = new Map<string, string>();
  for (const [api, get] of WRAPPABLE) {
    let fn: unknown;
    try {
      fn = get();
    } catch {
      continue;
    }
    if (typeof fn !== "function" || isNative(fn)) continue;
    let src = "";
    try {
      src = Function.prototype.toString.call(fn).slice(0, 4000);
    } catch {
      continue;
    }
    for (const [id, marker] of matchMarkers(registry, registry.wrapperMarkers, src)) if (!found.has(id)) found.set(id, `${api} (${marker})`);
  }
  return [...found].map(([id, detail]) => ({
    key: `env.driver-wrapper:${id}`,
    reason: makeReason("env.driver-wrapper", t, { detail, drivers: { [id]: 6 } }),
  }));
}

/**
 * Functions created by CDP Runtime.addBinding: native, nameless, zero-arity, and they throw
 * "should be exactly one string" when called without arguments. Catches Puppeteer/Playwright
 * exposeFunction, Patchright and rebrowser's random binding.
 */
export function cdpBindings(win: Window = window): string[] {
  const out: string[] = [];
  let keys: string[] = [];
  try {
    keys = Object.keys(win);
  } catch {
    return out;
  }
  for (const k of keys.slice(0, 2000)) {
    let v: unknown;
    try {
      v = (win as unknown as Record<string, unknown>)[k];
    } catch {
      continue;
    }
    if (typeof v !== "function" || v.name !== "" || v.length !== 0) continue;
    let src = "";
    try {
      src = Function.prototype.toString.call(v);
    } catch {
      continue;
    }
    if (!/^function \(\) \{ \[native code\] \}$/.test(src)) continue;
    try {
      (v as () => unknown)();
    } catch (e) {
      if (/exactly one string/.test(String((e as Error)?.message))) out.push(k);
    }
  }
  return out;
}

/** DevTools' command-line helpers become own window properties while a CDP evaluate with includeCommandLineAPI runs. */
export function devtoolsCommandLine(): string | null {
  if (typeof window === "undefined") return null;
  for (const name of ["getEventListeners", "$x", "queryObjects", "monitorEvents"]) {
    try {
      if (Object.getOwnPropertyDescriptor(window, name)) return name;
    } catch {
      /* ignore */
    }
  }
  return null;
}
