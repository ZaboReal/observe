import { Sensor } from "./sensor";
import type { SensorConfig } from "./types";

export { Sensor } from "./sensor";
export { DRIVERS, buildIndex } from "./registry";
export type { DriverSignature, DomSignature, MechanicsProfile, RegistryIndex } from "./registry";
export { analyzeAction, mechanicsHints } from "./detect/analyze";
export { Scorer, AGENT_THRESHOLD, HUMAN_THRESHOLD } from "./detect/scorer";
export { RULES, makeReason } from "./detect/rules";
export type { RuleId, RuleDef } from "./detect/rules";
export type { ActionRecord, ClickRecord, TypingRecord, ScrollRecord, FormRecord, LabStreamEvent } from "./capture";
export { VERSION } from "./version";
export { TOKEN_HEADER, TOKEN_FIELD } from "./core/protect";
export * from "./types";

const instances = new Map<string, Sensor>();

/**
 * Create (or return) the sensor for this key and endpoint, and start it.
 * Calling `init` twice with the same key and endpoint returns the same instance.
 */
export function init(config: SensorConfig = {}): Sensor {
  const key = `${config.publishableKey ?? ""}|${config.endpoint ?? ""}`;
  let s = instances.get(key);
  if (!s) {
    s = new Sensor(config);
    instances.set(key, s);
  }
  s.start();
  expose(s);
  return s;
}

/** Make the sensor findable as `window.ObserveSensor.instance` for page code, however it was created. */
function expose(s: Sensor): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as unknown as { ObserveSensor?: { instance?: Sensor } };
    if (w.ObserveSensor) w.ObserveSensor.instance = s;
    else w.ObserveSensor = { instance: s };
  } catch {
    /* frozen or non-writable global */
  }
}
