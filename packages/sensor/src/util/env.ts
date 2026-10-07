/** Guards and safe wrappers for browser globals. Everything here must work during SSR and in odd embeds. */

export const hasWindow = typeof window !== "undefined" && typeof document !== "undefined";

export function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function randomId(prefix: string, bytes = 12): string {
  let out = "";
  try {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    for (const b of buf) out += b.toString(16).padStart(2, "0");
  } catch {
    for (let i = 0; i < bytes * 2; i++) out += Math.floor(Math.random() * 16).toString(16);
  }
  return `${prefix}_${out}`;
}

export function safeGet(storage: "local" | "session", key: string): string | null {
  try {
    const s = storage === "local" ? window.localStorage : window.sessionStorage;
    return s.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(storage: "local" | "session", key: string, value: string): boolean {
  try {
    const s = storage === "local" ? window.localStorage : window.sessionStorage;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(storage: "local" | "session", key: string): void {
  try {
    const s = storage === "local" ? window.localStorage : window.sessionStorage;
    s.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function queryParam(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

/** True when the document is visible and focused right now. */
export function pageState(): { hidden: boolean; focused: boolean } {
  let hidden = false;
  let focused = true;
  try {
    hidden = document.visibilityState === "hidden";
  } catch {
    /* ignore */
  }
  try {
    focused = document.hasFocus();
  } catch {
    /* ignore */
  }
  return { hidden, focused };
}
