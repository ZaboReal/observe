/**
 * `checkObserve()`: ask the console what to do with a protected request. Plain `fetch`, no Next.js imports, so it runs
 * in any server runtime (Node, Bun, Deno, edge). In Next.js, `observe.check()` from `@observe/next/server` wraps it
 * and reads the token from `headers()`.
 */
import { env, observeUrl, TimeoutError, withTimeout } from "./config.js";
import type { CheckOptions, ObserveDecision } from "./types.js";

export type * from "./types.js";

/** Header the sensor adds to protected `fetch` / `XMLHttpRequest` calls. */
export const TOKEN_HEADER = "x-observe-token";

/** Clients give up on `/api/v1/decide` after this long and fail open. */
export const DECIDE_TIMEOUT_MS = 1500;

// On globalThis, not in module scope: Next bundles route handlers and server actions separately, so one process can
// hold several copies of this module.
const WARNED = Symbol.for("@observe/next.warned");
const flags = globalThis as { [WARNED]?: boolean };

/** The decision used whenever the console cannot be asked: observe mode, unknown driver, admitted. */
export function failOpen(tokenSent: boolean, error: string): ObserveDecision {
  if (!flags[WARNED]) {
    flags[WARNED] = true;
    console.warn(`[observe] check failed open (${error}); requests are admitted. Further failures are not logged.`);
  }
  return {
    mode: "observe",
    verdict: "unknown",
    tier: "unknown",
    driver: null,
    confidence: 0,
    decidedBy: null,
    outcome: "admit",
    wouldBlock: false,
    price: null,
    policy: null,
    token: tokenSent ? "unchecked" : "missing",
    error,
  };
}

/** Test hook: let the next failure warn again. */
export function resetWarning(): void {
  flags[WARNED] = false;
}

function pathOf(url: string): string | undefined {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

function isDecision(v: unknown): v is ObserveDecision {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  return typeof d.outcome === "string" && typeof d.verdict === "string";
}

/**
 * Ask the console what to do with `action`. Never throws: on a missing secret key, a network error, a timeout
 * (1.5 s) or any answer but `200`, it returns `failOpen()` with `error` set.
 */
export async function checkObserve(action: string, opts: CheckOptions = {}): Promise<ObserveDecision> {
  const { request } = opts;
  const token = opts.token !== undefined ? opts.token || null : (request?.headers.get(TOKEN_HEADER) ?? null);
  const tokenSent = Boolean(token);

  const secretKey = opts.secretKey ?? env("OBSERVE_SECRET_KEY");
  if (!secretKey) return failOpen(tokenSent, "OBSERVE_SECRET_KEY is not set");

  const body = {
    token,
    action,
    method: opts.method ?? request?.method,
    path: opts.path ?? (request ? pathOf(request.url) : undefined),
  };

  try {
    return await withTimeout(DECIDE_TIMEOUT_MS, async (signal) => {
      const res = await fetch(`${observeUrl(opts.observeUrl)}/api/v1/decide`, {
        method: "POST",
        headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal,
      });
      if (res.status !== 200) {
        // Drain the body so the connection can be reused.
        await res.body?.cancel().catch(() => {});
        return failOpen(tokenSent, `decide answered ${res.status}`);
      }
      const data: unknown = await res.json().catch(() => null);
      if (!isDecision(data)) return failOpen(tokenSent, "decide sent an unexpected body");
      return { ...data, wouldBlock: typeof data.wouldBlock === "boolean" ? data.wouldBlock : data.outcome === "refuse" };
    });
  } catch (e) {
    if (e instanceof TimeoutError) return failOpen(tokenSent, `decide ${e.message}`);
    return failOpen(tokenSent, `could not reach the console: ${e instanceof Error ? e.message : String(e)}`);
  }
}
