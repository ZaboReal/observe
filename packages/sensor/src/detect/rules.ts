import type { Reason, Robustness } from "../types";

export interface RuleDef {
  label: string;
  /** Log-odds weight. Positive = agent. */
  weight: number;
  robustness: Robustness;
  decisive?: boolean;
  /** Max times this rule counts inside the evaluation window. Default 3. */
  maxCount?: number;
}

/**
 * Starting weights. They are hand-set from public teardowns and papers and must be replaced by
 * weights fitted in the benchmark lab before anything blocks on them.
 */
export const RULES = {
  // Environment and automation (persistent)
  "env.webdriver": { label: "navigator.webdriver is true", weight: 6, robustness: "decisive", decisive: true },
  "env.automation-global": { label: "Automation framework global in the page", weight: 6, robustness: "decisive", decisive: true },
  "env.agent-ua": { label: "User agent declares an automated agent", weight: 6, robustness: "decisive", decisive: true },
  "env.ua-mismatch": { label: "User agent and client hints disagree", weight: 1.5, robustness: "high" },
  "env.stack-marker": { label: "Automation framework in the call stack", weight: 6, robustness: "decisive", decisive: true },
  "env.driver-wrapper": { label: "Built-in API replaced by automation framework code", weight: 6, robustness: "decisive", decisive: true },
  "env.software-gl": { label: "Software WebGL renderer (no GPU)", weight: 0.6, robustness: "situational" },
  // Agent VMs use ordinary laptop and monitor sizes (1440x900, 1920x1080), so this only helps name a driver.
  "env.agent-screen": { label: "Screen size some agent VMs use", weight: 0, robustness: "low" },
  "env.viewport-shift": { label: "Viewport shrank as a debugger banner appeared", weight: 0.8, robustness: "situational" },
  "env.debugger": { label: "DevTools-protocol client with Runtime enabled", weight: 1, robustness: "situational" },
  "env.cdp-binding": { label: "DevTools-protocol binding on window", weight: 4, robustness: "high" },
  "env.devtools-api": { label: "DevTools command-line API exposed to the page", weight: 2, robustness: "medium" },
  "env.dual-focus": { label: "Two tabs report focus at once (focus emulation)", weight: 2, robustness: "high", maxCount: 1 },
  "env.browser": { label: "Browser with a built-in agent", weight: 0, robustness: "low" },
  "env.installed": { label: "Agent extension or browser installed", weight: 0, robustness: "low", maxCount: 10 },
  "env.patched-api": { label: "Browser APIs patched to hide automation", weight: 2.5, robustness: "high" },
  "env.modified-api": { label: "Built-in APIs wrapped by injected code", weight: 0.3, robustness: "low" },

  // Page artifacts (persistent while present)
  "artifact.active": { label: "Agent overlay present in the page", weight: 5, robustness: "low", decisive: true },
  "artifact.residue": { label: "Agent left injected styles in this page", weight: 1.5, robustness: "low" },
  "artifact.extension": { label: "Known agent extension injected into the page", weight: 2.5, robustness: "low" },
  "artifact.message": { label: "Agent extension messaged the page while acting", weight: 3, robustness: "low" },
  "artifact.console": { label: "Automation code logged its own marker to the console", weight: 6, robustness: "low", decisive: true },

  // WebMCP
  "webmcp.tool": { label: "An agent invoked a WebMCP tool", weight: 6, robustness: "decisive", decisive: true },
  "webmcp.form": { label: "Form submitted by an agent (agentInvoked)", weight: 6, robustness: "decisive", decisive: true },

  // Pointer and click
  "pointer.teleport": { label: "Pointer jumped straight to the target", weight: 1.6, robustness: "medium" },
  "pointer.linear": { label: "Straight, constant-speed pointer path", weight: 1.2, robustness: "medium" },
  "pointer.human-path": { label: "Curved, variable-speed pointer path", weight: -1, robustness: "medium" },
  "pointer.zero-movement": { label: "Pointer moved with zero movement deltas", weight: 0.6, robustness: "situational" },
  "pointer.fractional": { label: "Mouse at fractional pixel positions at 1× zoom", weight: 1.5, robustness: "high" },
  "pointer.no-screen-position": { label: "Pointer events with no screen position", weight: 3, robustness: "high" },
  "click.positionless": { label: "Click with no position inside the element", weight: 1, robustness: "medium" },
  // Pointer Events: a mouse with no pressure sensor must report 0.5 while a button is down.
  // DevTools-protocol mouse events report 0 (measured on a CDP-driven Chromium, 2026-10-07).
  "click.zero-pressure": { label: "Mouse button pressed with zero pressure (synthetic)", weight: 2, robustness: "high" },
  "click.centre": { label: "Click on the exact centre of the element", weight: 0.8, robustness: "medium" },
  "click.off-centre": { label: "Click off-centre", weight: -0.3, robustness: "medium" },
  "click.no-hover": { label: "Pressed with no hover first", weight: 0.5, robustness: "medium" },
  "click.short-press": { label: "Press and release back to back", weight: 0.8, robustness: "medium" },
  "click.human-press": { label: "Natural press duration", weight: -0.4, robustness: "medium" },
  "click.untrusted": { label: "Click dispatched by script", weight: 2, robustness: "high" },
  "click.hidden": { label: "Click while the tab was hidden", weight: 2.5, robustness: "high" },
  "click.unfocused": { label: "Click while the page was unfocused", weight: 0.8, robustness: "situational" },
  "click.fixed-timing": { label: "Identical timing on every click", weight: 1.2, robustness: "high", maxCount: 1 },

  // Typing
  "typing.insert-no-keys": { label: "Text arrived with no key presses", weight: 1.8, robustness: "high" },
  "typing.insert-per-char": { label: "Text inserted one character at a time, no keys", weight: 0.6, robustness: "high" },
  "typing.paste-no-event": { label: "Paste with no shortcut or paste menu", weight: 1.2, robustness: "high" },
  "typing.phantom-shift": { label: "Capitals typed with no Shift key press", weight: 1.2, robustness: "high" },
  "typing.synthetic-paste": { label: "Paste event dispatched by script", weight: 2, robustness: "high" },
  "typing.blank-keys": { label: "Key events with no key or code", weight: 1.5, robustness: "high" },
  "form.change-before-input": { label: "Field fill fired change before input", weight: 1.2, robustness: "high" },
  "typing.machine-gaps": { label: "Key presses evenly spaced", weight: 1.5, robustness: "medium" },
  "typing.fast-gaps": { label: "Keys faster than a person can type", weight: 2, robustness: "medium" },
  "typing.no-holds": { label: "Keys released instantly", weight: 1, robustness: "medium" },
  "typing.human-rhythm": { label: "Natural typing rhythm", weight: -1.2, robustness: "medium" },
  "typing.rollover": { label: "Overlapping key presses", weight: -0.8, robustness: "high" },
  "typing.untrusted": { label: "Field filled by script", weight: 2, robustness: "high" },
  "typing.silent-set": { label: "Field value changed with no events", weight: 1.2, robustness: "medium" },
  "typing.hidden": { label: "Typing while the tab was hidden", weight: 2.5, robustness: "high" },

  // Scroll and forms
  "scroll.programmatic": { label: "Page scrolled with no wheel, key or touch", weight: 0.6, robustness: "medium" },
  "scroll.uniform-wheel": { label: "Uniform wheel steps", weight: 0.4, robustness: "low" },
  "scroll.absurd-wheel": { label: "Wheel deltas no device produces", weight: 2, robustness: "high" },
  "scroll.trackpad": { label: "Smooth trackpad-style scrolling", weight: -0.6, robustness: "medium" },
  "form.select-no-interaction": { label: "Dropdown changed with no click or key", weight: 1.5, robustness: "high" },

  // Cadence across actions
  "cadence.still": { label: "No pointer motion between actions", weight: 1.2, robustness: "high", maxCount: 2 },
  "cadence.superhuman": { label: "Moved between controls faster than a person can", weight: 1.5, robustness: "high", maxCount: 2 },
  "cadence.micro-motion": { label: "Pointer keeps moving between actions", weight: -0.8, robustness: "high", maxCount: 2 },

  // Driver naming only
  "driver.mechanics": { label: "Input mechanics match a known agent", weight: 0, robustness: "medium", maxCount: 50 },
} satisfies Record<string, RuleDef>;

export type RuleId = keyof typeof RULES;

export function rule(id: RuleId): RuleDef {
  return RULES[id];
}

export function makeReason(
  id: RuleId,
  t: number,
  extra: { detail?: string; drivers?: Record<string, number>; weight?: number } = {},
): Reason {
  const def: RuleDef = RULES[id];
  const r: Reason = {
    id,
    label: def.label,
    weight: extra.weight ?? def.weight,
    robustness: def.robustness,
    t,
  };
  if (def.decisive) r.decisive = true;
  if (extra.detail !== undefined) r.detail = extra.detail;
  if (extra.drivers && Object.keys(extra.drivers).length) r.drivers = extra.drivers;
  return r;
}
