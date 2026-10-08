/** Settings shared by the route and the server check. No framework imports: this runs in any runtime. */

/** The hosted console, used when `OBSERVE_URL` is not set. */
export const DEFAULT_OBSERVE_URL = "https://observe-console-theta.vercel.app";

/** Read an environment variable where there is a `process` (Node, Next, Vercel); `undefined` elsewhere. */
export function env(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

/** The console's base URL, without a trailing slash. */
export function observeUrl(override?: string): string {
  return (override ?? env("OBSERVE_URL") ?? DEFAULT_OBSERVE_URL).replace(/\/+$/, "");
}

/**
 * Run `fn` with an AbortSignal that fires after `ms`. The timer covers everything `fn` awaits, including reading the
 * body, and is always cleared. `timedOut()` tells an abort from our timer apart from any other error.
 */
export async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TimeoutError(ms)), ms);
  try {
    return await fn(controller.signal);
  } catch (e) {
    if (controller.signal.aborted) throw new TimeoutError(ms);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${ms} ms`);
    this.name = "TimeoutError";
  }
}
