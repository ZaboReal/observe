import { randomId, safeGet, safeRemove, safeSet } from "../util/env";

const DEVICE_KEY = "obs.did";
const SESSION_KEY = "obs.sid";
const SESSION_SEEN_KEY = "obs.sat";
const CONSENT_KEY = "obs.consent";
const SESSION_IDLE_MS = 30 * 60 * 1000;

export interface SessionIds {
  deviceId: string;
  sessionId: string;
  /** Unique per page load. */
  pageId: string;
}

/** Device id lives in localStorage, the session in sessionStorage (per tab) with a 30-minute idle timeout. */
export function loadSession(): SessionIds {
  let deviceId = safeGet("local", DEVICE_KEY);
  if (!deviceId) {
    deviceId = randomId("d");
    safeSet("local", DEVICE_KEY, deviceId);
  }
  let sessionId = safeGet("session", SESSION_KEY);
  const seen = Number(safeGet("session", SESSION_SEEN_KEY) ?? 0);
  if (!sessionId || Date.now() - seen > SESSION_IDLE_MS) {
    sessionId = randomId("s");
    safeSet("session", SESSION_KEY, sessionId);
  }
  safeSet("session", SESSION_SEEN_KEY, String(Date.now()));
  return { deviceId, sessionId, pageId: randomId("p", 8) };
}

export function touchSession(): void {
  safeSet("session", SESSION_SEEN_KEY, String(Date.now()));
}

export function newSession(): string {
  const sessionId = randomId("s");
  safeSet("session", SESSION_KEY, sessionId);
  safeSet("session", SESSION_SEEN_KEY, String(Date.now()));
  return sessionId;
}

export type ConsentState = "granted" | "denied" | "unknown";

export function readConsent(): ConsentState {
  const v = safeGet("local", CONSENT_KEY);
  return v === "granted" || v === "denied" ? v : "unknown";
}

export function writeConsent(state: "granted" | "denied"): void {
  safeSet("local", CONSENT_KEY, state);
}

export function clearSessionStorage(): void {
  safeRemove("session", SESSION_KEY);
  safeRemove("session", SESSION_SEEN_KEY);
}
