/**
 * Script-tag build. Exposes `window.ObserveSensor` and starts automatically when the tag carries
 * `data-key`, `data-endpoint`, `data-debug` or `data-auto`:
 *
 *   <script src="observe-sensor.min.js" data-key="pk_..." data-endpoint="https://collector.example" data-debug></script>
 */
import * as api from "./index";
import type { CaptureMode, SensorConfig } from "./types";

declare global {
  interface Window {
    ObserveSensor?: typeof api & { instance?: api.Sensor };
  }
}

const g = (typeof window !== "undefined" ? window : undefined) as Window | undefined;

if (g && !g.ObserveSensor) {
  const ns: typeof api & { instance?: api.Sensor } = { ...api };
  g.ObserveSensor = ns;
  const script = document.currentScript as HTMLScriptElement | null;
  const ds = script?.dataset;
  if (ds && (ds.key !== undefined || ds.endpoint !== undefined || ds.debug !== undefined || ds.auto !== undefined)) {
    const config: SensorConfig = {};
    if (ds.key) config.publishableKey = ds.key;
    if (ds.endpoint) config.endpoint = ds.endpoint;
    if (ds.debug !== undefined && ds.debug !== "false") config.debug = true;
    if (ds.capture === "lab" || ds.capture === "standard") config.capture = ds.capture as CaptureMode;
    if (ds.waitForConsent !== undefined && ds.waitForConsent !== "false") config.waitForConsent = true;
    if (ds.labDriver) config.labDriver = ds.labDriver;
    ns.instance = api.init(config);
  }
}
