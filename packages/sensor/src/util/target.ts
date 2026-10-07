/**
 * Describes event targets without reading content: tag, ARIA role, input type and geometry only.
 * Never text, values, ids or class names of the customer's elements.
 */

export interface TargetInfo {
  /** Stable per-page ordinal so records can be linked without identifying the element. */
  ordinal: number;
  tag: string;
  role?: string;
  inputType?: string;
  editable: boolean;
  /** Field holds credentials or one-time codes; password managers legitimately fill these. */
  sensitive: boolean;
  rect?: { x: number; y: number; w: number; h: number };
}

const ordinals = new WeakMap<Element, number>();
let nextOrdinal = 1;

export function resetTargetOrdinals(): void {
  nextOrdinal = 1;
}

const SENSITIVE_AUTOCOMPLETE = /(^|\s)(username|email|current-password|new-password|one-time-code|cc-|tel)/;

export function asElement(t: EventTarget | null): Element | null {
  if (!t) return null;
  if (typeof Element !== "undefined" && t instanceof Element) return t;
  // Text nodes and the document are not useful targets.
  return null;
}

export function describeTarget(el: Element | null, withRect = true): TargetInfo | null {
  if (!el) return null;
  let ordinal = ordinals.get(el);
  if (ordinal === undefined) {
    ordinal = nextOrdinal++;
    ordinals.set(el, ordinal);
  }
  const tag = el.localName || el.tagName.toLowerCase();
  const role = el.getAttribute("role") ?? undefined;
  let inputType: string | undefined;
  let editable = false;
  let sensitive = false;
  if (tag === "input") {
    const input = el as HTMLInputElement;
    inputType = (input.type || "text").toLowerCase();
    editable = !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"].includes(inputType);
    const ac = (input.getAttribute("autocomplete") || "").toLowerCase();
    sensitive = inputType === "password" || SENSITIVE_AUTOCOMPLETE.test(ac);
  } else if (tag === "textarea" || tag === "select") {
    editable = true;
  } else if ((el as HTMLElement).isContentEditable) {
    editable = true;
  }
  const info: TargetInfo = { ordinal, tag, editable, sensitive };
  if (role) info.role = role.slice(0, 40);
  if (inputType) info.inputType = inputType;
  if (withRect && typeof (el as HTMLElement).getBoundingClientRect === "function") {
    const r = el.getBoundingClientRect();
    info.rect = { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  return info;
}
