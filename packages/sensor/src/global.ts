/**
 * Script-tag build. Exposes `window.ObserveSensor` and starts automatically when the tag carries
 * `data-key`, `data-endpoint`, `data-protect`, `data-debug` or `data-auto`:
 *
 *   <script src="observe-sensor.min.js" data-key="pk_..." data-endpoint="/_observe"
 *     data-protect='[{"path":"/api/invoices/export","action":"export_invoices"}]'></script>
 *
 * However the sensor is created (`data-*` here or `ObserveSensor.init(...)` from page code), it is also
 * `window.ObserveSensor.instance`.
 */
import * as api from "./index";
import type { CaptureMode, SensorConfig } from "./types";

declare global {
  interface Window {
    ObserveSensor?: typeof api & { instance?: api.Sensor };
  }
}

const g = (typeof window !== "undefined" ? window : undefined) as Window | undefined;

// `init()` from the npm module may already have left `{ instance }` here; fill in the API around it.
if (g && !(g.ObserveSensor && typeof g.ObserveSensor.init === "function")) {
  const ns: typeof api & { instance?: api.Sensor } = Object.assign(g.ObserveSensor || {}, api);
  g.ObserveSensor = ns;
  const script = document.currentScript as HTMLScriptElement | null;
  const ds = script?.dataset;
  if (ds && (ds.key !== undefined || ds.endpoint !== undefined || ds.protect !== undefined || ds.debug !== undefined || ds.auto !== undefined)) {
    const config: SensorConfig = {};
    if (ds.key) config.publishableKey = ds.key;
    if (ds.endpoint) config.endpoint = ds.endpoint;
    if (ds.debug !== undefined && ds.debug !== "false") config.debug = true;
    if (ds.capture === "lab" || ds.capture === "standard") config.capture = ds.capture as CaptureMode;
    if (ds.waitForConsent !== undefined && ds.waitForConsent !== "false") config.waitForConsent = true;
    if (ds.labDriver) config.labDriver = ds.labDriver;
    if (ds.protect) {
      try {
        const rules = JSON.parse(ds.protect);
        if (Array.isArray(rules)) config.protect = rules;
        else throw new Error("not an array");
      } catch {
        console.warn("[observe] data-protect must be a JSON array of { path, method, action }");
      }
    }
    ns.instance = api.init(config);
  }
}
