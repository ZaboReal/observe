"use client";

import { SCRIPT_ID, scriptSrc, sensorLoaded, startSensor } from "./start.js";
import type { ObserveOptions } from "./types.js";

/**
 * Start Observe from `instrumentation-client.ts` (Next.js 15.3+) instead of rendering `<Observe />`. Injects the
 * sensor's script tag and starts it when it loads. Safe to call more than once; use this or `<Observe />`, not both.
 *
 *   import { initObserve } from "@observe/next";
 *   initObserve({ protect: [{ path: "/api/invoices/export", method: "POST", action: "export_invoices" }] });
 */
export function initObserve(options: ObserveOptions = {}): void {
  if (typeof document === "undefined") return;
  if (sensorLoaded()) {
    startSensor(options); // The script is already on the page.
    return;
  }
  if (document.getElementById(SCRIPT_ID)) return; // Already loading.
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = scriptSrc(options.path);
  script.async = true;
  script.addEventListener("load", () => startSensor(options));
  script.addEventListener("error", () => {
    if (options.debug) console.warn("[observe] could not load", script.src);
  });
  (document.head ?? document.documentElement).appendChild(script);
}
