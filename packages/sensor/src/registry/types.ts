import type { Confidence, DriverKind } from "../types";

export interface DomSignature {
  ids?: string[];
  /** Id prefixes, for products that version their ids (e.g. `pplx-agent-`). */
  idPrefixes?: string[];
  classes?: string[];
  /** Attribute names (presence is enough). */
  attributes?: string[];
  /** Element tag names (custom elements and odd tags such as `__hrp__`). */
  tags?: string[];
}

export interface MechanicsProfile {
  /** Hover-to-press time range in ms for clicks this driver makes. */
  hoverMs?: [number, number];
  /** Press-to-release time range in ms. */
  pressMs?: [number, number];
  /** Gap between consecutive key presses in ms. */
  keyGapMs?: [number, number];
  /** keydown → keyup hold time in ms. */
  keyHoldMs?: [number, number];
  /** How text arrives. */
  typing?: "insert-per-char" | "insert-bulk" | "keys" | "paste" | "synthetic-paste" | "value-set";
  /** How the page scrolls. */
  scroll?: "wheel-100" | "no-wheel" | "gesture" | "wheel-buttons" | "wheel";
  /** Clicks land on the exact centre of the target element. */
  clickCentre?: boolean;
  /** The pointer jumps to the target with no intermediate samples. */
  teleports?: boolean;
  /** Typical fixed screen sizes (`WxH`). */
  screens?: string[];
}

/** A planted element whose computed style reveals CSS an extension or browser injects on every page. */
export interface CssProbe {
  tag?: string;
  id?: string;
  className?: string;
  /** Computed style properties (camelCase) and the values that confirm the match. */
  expect: Record<string, string>;
}

/**
 * Markers that show a product is installed or present, not that its agent is acting.
 * They only help name the driver once behaviour says an agent is driving.
 */
export interface PresenceSignature {
  dom?: DomSignature;
  styleIds?: string[];
  windowGlobals?: string[];
  cssProbes?: CssProbe[];
}

export interface DriverSignature {
  id: string;
  name: string;
  provider: string;
  kind: DriverKind;
  /** Page elements present only while the agent is acting. Seeing one is near-decisive. */
  activeDom?: DomSignature;
  /** Page elements that persist after the agent stops: evidence of earlier use on this page. */
  residueDom?: DomSignature;
  /** Ids of injected `<style>` elements that persist. Treated as residue. */
  styleIds?: string[];
  /** CSS keyframe names the agent injects. */
  keyframes?: string[];
  /** Installed-only markers. Naming hints, never verdict evidence. */
  presence?: PresenceSignature;
  /** Extension ids, matched against `chrome-extension://<id>/` URLs and WXT start-up messages in the page. */
  extensionIds?: string[];
  /** Main-world `window` properties injected while automating. Decisive. */
  windowGlobals?: string[];
  /** How many of `windowGlobals` must be present before they count (for generic-sounding names). Default 1. */
  minGlobalMatches?: number;
  /** `document` properties injected while automating. Decisive. */
  documentGlobals?: string[];
  /** Substrings in stack traces of code injected by this driver. */
  stackMarkers?: string[];
  /** Regex sources for `window.postMessage` `data.type` values this driver sends while acting. */
  messageTypes?: string[];
  /** Substrings this driver's main-world code writes to the page console while acting. */
  consoleMarkers?: string[];
  /** Regex sources matched against `navigator.userAgent`. Identify the browser only. */
  userAgent?: string[];
  /** Regex sources for user-agent tokens that declare an automated agent. Decisive. */
  declaredUserAgent?: string[];
  /** `navigator.<name>` properties only this browser defines (e.g. `brave`). Identify the browser only. */
  navigatorProps?: string[];
  /** `navigator.userAgentData.brands[].brand` values. Identify the browser only. */
  brands?: string[];
  mechanics?: MechanicsProfile;
  /** Overall reliability of the entries. */
  confidence: Confidence;
  sources: string[];
  notes?: string;
  /** Last product version the identifiers were checked against, when known. */
  verifiedVersion?: string;
}
