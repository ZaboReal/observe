import { makeReason } from "../detect/rules";
import type { RegistryIndex } from "../registry";
import { IGNORE_ATTR } from "./artifacts";
import type { ProbeResult } from "./automation";

/**
 * Plants hidden elements whose computed style reveals CSS that an extension or agentic browser
 * injects on every page (e.g. Comet's agent overlay styles). Identifies the product, not activity.
 */
export function probeCss(registry: RegistryIndex, t: number): ProbeResult[] {
  if (typeof document === "undefined" || !document.body || registry.cssProbes.length === 0) return [];
  const host = document.createElement("div");
  host.setAttribute(IGNORE_ATTR, "");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:absolute;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden;visibility:hidden;contain:strict";
  const out: ProbeResult[] = [];
  try {
    const planted: Array<[HTMLElement, (typeof registry.cssProbes)[number]]> = [];
    for (const probe of registry.cssProbes) {
      const el = document.createElement(probe[0].tag ?? "div");
      if (probe[0].id) el.id = probe[0].id;
      if (probe[0].className) el.className = probe[0].className;
      host.appendChild(el);
      planted.push([el, probe]);
    }
    document.body.appendChild(host);
    for (const [el, [probe, driverId]] of planted) {
      const cs = getComputedStyle(el) as unknown as Record<string, string>;
      const hit = Object.entries(probe.expect).every(([prop, value]) => cs[prop] === value);
      if (hit && !out.some((o) => o.key === `env.installed:${driverId}`)) {
        out.push({
          key: `env.installed:${driverId}`,
          reason: makeReason("env.installed", t, { detail: `CSS for ${probe.id ? "#" + probe.id : "." + probe.className}`, drivers: { [driverId]: 1 } }),
        });
      }
    }
  } catch {
    /* ignore */
  } finally {
    host.remove();
  }
  return out;
}
