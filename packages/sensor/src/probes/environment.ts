import { makeReason } from "../detect/rules";
import type { RegistryIndex } from "../registry";
import type { ProbeResult } from "./automation";

const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software rasterizer|mesa offscreen|basic render driver/i;

/** Screen sizes that agent VMs use, from the registry's mechanics profiles. */
export function probeScreen(registry: RegistryIndex, t: number): ProbeResult[] {
  if (typeof screen === "undefined") return [];
  const size = `${screen.width}x${screen.height}`;
  const drivers: Record<string, number> = {};
  for (const sig of registry.byId.values()) if (sig.mechanics?.screens?.includes(size)) drivers[sig.id] = 0.5;
  if (!Object.keys(drivers).length) return [];
  return [{ key: "env.agent-screen", reason: makeReason("env.agent-screen", t, { detail: size, drivers }) }];
}

/**
 * Reports only whether WebGL renders in software, never the renderer string.
 * Creating a context costs a few milliseconds, so call this once, when the page is idle.
 */
export function probeSoftwareGl(t: number): ProbeResult[] {
  if (typeof document === "undefined") return [];
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return [];
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    if (!SOFTWARE_GL.test(renderer)) return [];
    return [{ key: "env.software-gl", reason: makeReason("env.software-gl", t) }];
  } catch {
    return [];
  }
}

/**
 * Lab capture only: what kind of machine and browser the page runs in, so a new agent's environment can be written
 * down (a cloud VM's software GPU, missing cameras, fixed window sizes). Unlike the standard probes it keeps the
 * renderer string. Nothing here is page content or a value anyone typed.
 */
export async function labEnvironment(): Promise<Record<string, unknown>> {
  if (typeof window === "undefined") return {};
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { brands?: { brand: string; version: string }[]; mobile?: boolean; platform?: string; getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>> };
    connection?: { effectiveType?: string; rtt?: number };
  };
  const mq = (q: string) => {
    try {
      return matchMedia(q).matches;
    } catch {
      return null;
    }
  };
  const env: Record<string, unknown> = {
    ua: nav.userAgent,
    platform: nav.platform,
    languages: [...(nav.languages ?? [])].slice(0, 6),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tzOffset: new Date().getTimezoneOffset(),
    screen: { w: screen.width, h: screen.height, aw: screen.availWidth, ah: screen.availHeight, depth: screen.colorDepth },
    window: { iw: innerWidth, ih: innerHeight, ow: outerWidth, oh: outerHeight, x: screenX, y: screenY },
    dpr: devicePixelRatio,
    cores: nav.hardwareConcurrency ?? null,
    memory: nav.deviceMemory ?? null,
    touchPoints: nav.maxTouchPoints ?? 0,
    pointer: { fine: mq("(pointer: fine)"), coarse: mq("(pointer: coarse)"), hover: mq("(hover: hover)"), anyFine: mq("(any-pointer: fine)") },
    webdriver: nav.webdriver ?? null,
    plugins: nav.plugins?.length ?? null,
    pdfViewer: (nav as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled ?? null,
    connection: nav.connection ? { type: nav.connection.effectiveType ?? null, rtt: nav.connection.rtt ?? null } : null,
    historyLength: history.length,
    hasReferrer: Boolean(document.referrer),
    focused: document.hasFocus(),
    visibility: document.visibilityState,
    chromeKeys: typeof (window as Window & { chrome?: object }).chrome === "object" ? Object.keys((window as Window & { chrome?: object }).chrome ?? {}).slice(0, 12) : null,
  };
  if (nav.userAgentData) {
    env.uaData = { brands: nav.userAgentData.brands, mobile: nav.userAgentData.mobile, platform: nav.userAgentData.platform };
    try {
      env.uaHigh = await nav.userAgentData.getHighEntropyValues?.(["platformVersion", "architecture", "model", "fullVersionList", "formFactors"]);
    } catch {
      /* ignore */
    }
  }
  try {
    const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl) env.gl = { vendor: String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)), renderer: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) };
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    /* ignore */
  }
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices();
    if (devices) env.mediaDevices = devices.reduce<Record<string, number>>((n, d) => ((n[d.kind] = (n[d.kind] ?? 0) + 1), n), {});
  } catch {
    /* ignore */
  }
  try {
    env.voices = typeof speechSynthesis !== "undefined" ? speechSynthesis.getVoices().length : null;
  } catch {
    /* ignore */
  }
  return env;
}

/**
 * Watches for the viewport shrinking by a banner's height while the window stays the same size,
 * which is what Chrome's "started debugging this browser" bar does when an extension attaches the debugger.
 * Unvalidated: treat as a lab signal.
 */
export class ViewportShiftWatcher {
  private last = { iw: 0, ih: 0, ow: 0, oh: 0 };
  private handler = () => this.check();

  constructor(
    private readonly clock: () => number,
    private readonly onShift: (r: ProbeResult) => void,
  ) {}

  start(): void {
    if (typeof window === "undefined") return;
    this.snapshot();
    window.addEventListener("resize", this.handler, { passive: true });
  }

  stop(): void {
    if (typeof window !== "undefined") window.removeEventListener("resize", this.handler);
  }

  private snapshot(): void {
    this.last = { iw: window.innerWidth, ih: window.innerHeight, ow: window.outerWidth, oh: window.outerHeight };
  }

  private check(): void {
    const prev = this.last;
    this.snapshot();
    const cur = this.last;
    const drop = prev.ih - cur.ih;
    if (drop >= 24 && drop <= 64 && cur.iw === prev.iw && cur.ow === prev.ow && cur.oh === prev.oh) {
      this.onShift({
        key: "env.viewport-shift",
        reason: makeReason("env.viewport-shift", this.clock(), {
          detail: `−${drop} px`,
          drivers: { "claude-in-chrome": 0.5, "chatgpt-extension": 0.5, openclaw: 0.5, "manus-operator": 0.5 },
        }),
      });
    }
  }
}

/**
 * Opt-in: detects a DevTools-protocol client with the Runtime domain enabled (Puppeteer, Playwright, raw CDP).
 * V8 builds previews of console arguments for an attached client; for an Error with no own name/message/stack
 * it falls back to a normal read that runs inherited getters. Works on Chrome 154 (the old Error.stack and
 * groupEnd-Proxy traps were closed in Chrome 138 and 152). Also fires when DevTools is open, so it is weak.
 */
export function probeDebugger(t: number): ProbeResult[] {
  if (typeof console === "undefined") return [];
  const groupEnd = (console as Console & { groupEnd: (...a: unknown[]) => void }).groupEnd;
  let hits = 0;
  try {
    const proto = (props: PropertyDescriptorMap) =>
      Object.create(Error.prototype, { ...props, toString: { value: () => "E" } });
    const e1 = new Error("x");
    Object.setPrototypeOf(e1, proto({ name: { get: () => (hits++, "Error") } }));
    const e2 = new Error();
    Object.setPrototypeOf(e2, proto({ message: { get: () => (hits++, "") } }));
    groupEnd.call(console, e1);
    groupEnd.call(console, e2);
  } catch {
    /* ignore */
  }
  return hits > 0 ? [{ key: "env.debugger", reason: makeReason("env.debugger", t, { detail: `${hits} preview reads` }) }] : [];
}

/**
 * Two same-origin tabs cannot both have OS focus. Focus emulation (Playwright, the ChatGPT extension,
 * Chrome DevTools MCP) and Gemini's forced focus make background tabs report focus anyway.
 */
export class DualFocusWatcher {
  private channel: BroadcastChannel | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private peers = new Map<string, number>();
  private reported = false;

  constructor(
    private readonly pageId: string,
    private readonly clock: () => number,
    private readonly onFound: (r: ProbeResult) => void,
  ) {}

  start(): void {
    if (typeof BroadcastChannel === "undefined") return;
    try {
      this.channel = new BroadcastChannel("observe-sensor-focus");
    } catch {
      return;
    }
    this.channel.onmessage = (e: MessageEvent) => {
      const d = e.data as { p?: string; f?: boolean };
      if (!d?.p || d.p === this.pageId) return;
      if (d.f) this.peers.set(d.p, Date.now());
      else this.peers.delete(d.p);
      this.check();
    };
    this.timer = setInterval(() => this.beat(), 1000);
    this.beat();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.channel?.close();
    this.channel = null;
  }

  private focused(): boolean {
    try {
      return document.hasFocus() && document.visibilityState === "visible";
    } catch {
      return false;
    }
  }

  private beat(): void {
    try {
      this.channel?.postMessage({ p: this.pageId, f: this.focused() });
    } catch {
      /* ignore */
    }
    this.check();
  }

  private check(): void {
    if (this.reported || !this.focused()) return;
    const now = Date.now();
    for (const [peer, seen] of this.peers) {
      // A peer that claimed focus within the last 1.5 s while this tab also has focus.
      if (now - seen < 1500) {
        this.reported = true;
        this.onFound({
          key: "env.dual-focus",
          reason: makeReason("env.dual-focus", this.clock(), {
            detail: `with tab ${peer.slice(0, 8)}`,
            drivers: { playwright: 0.5, "chatgpt-extension": 0.5, "gemini-in-chrome": 0.5, "chrome-devtools-mcp": 0.5 },
          }),
        });
        return;
      }
      if (now - seen > 5000) this.peers.delete(peer);
    }
  }
}
