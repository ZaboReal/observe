/** Browser side, shared by `<Observe />` and `initObserve()`: start the sensor once per page. */
import type { ObserveOptions } from "./types.js";

export const DEFAULT_PATH = "/_observe";
export const SCRIPT_ID = "observe-sensor";

/** The part of the sensor's script-tag global (`window.ObserveSensor`) used here. */
interface SensorGlobal {
  init(config: Record<string, unknown>): unknown;
  instance?: unknown;
}

type ObserveWindow = Window & { ObserveSensor?: SensorGlobal; __observeStarted?: boolean };

export function basePath(path: string | undefined): string {
  return (path ?? DEFAULT_PATH).replace(/\/+$/, "");
}

export function scriptSrc(path: string | undefined): string {
  return `${basePath(path)}/s.js`;
}

/** The publishable key: the option, else `NEXT_PUBLIC_OBSERVE_KEY` (inlined by Next at build time). */
export function publishableKey(siteKey: string | undefined): string | undefined {
  if (siteKey) return siteKey;
  try {
    return process.env.NEXT_PUBLIC_OBSERVE_KEY || undefined;
  } catch {
    return undefined;
  }
}

/** True once the sensor's script has run on this page. */
export function sensorLoaded(): boolean {
  return typeof window !== "undefined" && typeof (window as ObserveWindow).ObserveSensor?.init === "function";
}

/**
 * Start the sensor if the script has loaded and nothing has started it yet. Returns true when this call started it.
 * The flag lives on `window`, so remounts, Fast Refresh and a second copy of this package all see it.
 */
export function startSensor(options: ObserveOptions): boolean {
  if (typeof window === "undefined") return false;
  const w = window as ObserveWindow;
  const ns = w.ObserveSensor;
  if (!ns || typeof ns.init !== "function") {
    if (options.debug) console.warn("[observe] the sensor script did not load; nothing is collected on this page.");
    return false;
  }
  if (w.__observeStarted || ns.instance) return false;
  w.__observeStarted = true;
  const config: Record<string, unknown> = { endpoint: basePath(options.path) };
  const key = publishableKey(options.siteKey);
  if (key) config.publishableKey = key;
  else if (options.debug) console.warn("[observe] no publishable key: set NEXT_PUBLIC_OBSERVE_KEY or pass siteKey.");
  if (options.protect?.length) config.protect = options.protect;
  if (options.debug) config.debug = true;
  try {
    ns.instance = ns.init(config);
  } catch (e) {
    console.warn("[observe] the sensor failed to start:", e);
  }
  return true;
}
