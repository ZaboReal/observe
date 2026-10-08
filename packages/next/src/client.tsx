"use client";

import Script from "next/script";

import { SCRIPT_ID, scriptSrc, startSensor } from "./start.js";
import type { ObserveOptions } from "./types.js";

export type ObserveProps = ObserveOptions;

/**
 * Loads the sensor from the site's own forwarding route (`{path}/s.js`) after hydration and starts it once per page.
 * Put it in the root layout:
 *
 *   <Observe protect={[{ path: "/api/invoices/export", method: "POST", action: "export_invoices" }]} />
 */
export function Observe({ siteKey, protect, path, debug }: ObserveProps) {
  return (
    <Script
      id={SCRIPT_ID}
      src={scriptSrc(path)}
      strategy="afterInteractive"
      // onReady runs after the first load and on every remount; startSensor() only acts once per page.
      onReady={() => {
        startSensor({ siteKey, protect, path, debug });
      }}
    />
  );
}
