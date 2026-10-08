/**
 * `@observe/next/server`: decisions in route handlers and server actions.
 *
 *   import { observe } from "@observe/next/server";
 *   const d = await observe.check("export_invoices");
 *   if (d.wouldBlock) return new Response("Not allowed for this agent", { status: 403 });
 *
 * Outside Next.js use `checkObserve` from `@observe/next/check`, which never imports `next/headers`.
 */
import { headers } from "next/headers";

import { checkObserve, TOKEN_HEADER } from "./check.js";
import type { CheckOptions, ObserveDecision } from "./types.js";

export { checkObserve, DECIDE_TIMEOUT_MS, TOKEN_HEADER } from "./check.js";
export type * from "./types.js";

async function tokenFromHeaders(): Promise<string | null> {
  try {
    return (await headers()).get(TOKEN_HEADER);
  } catch {
    // Called outside a request (e.g. at build time): there is no token.
    return null;
  }
}

export const observe = {
  /**
   * Ask the console what to do with `action` for the current request. The token comes from `opts.token`, else the
   * `x-observe-token` header of `opts.request`, else the incoming request's headers (`headers()` from next/headers).
   * Never throws; fails open (`outcome: "admit"`, `wouldBlock: false`, `error` set) when the console can't answer.
   */
  async check(action: string, opts: CheckOptions = {}): Promise<ObserveDecision> {
    if (opts.token !== undefined || opts.request) return checkObserve(action, opts);
    return checkObserve(action, { ...opts, token: await tokenFromHeaders() });
  },
};
