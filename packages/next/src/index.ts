"use client";

/**
 * `@observe/next`: the browser side. `<Observe />` for the root layout, or `initObserve()` for
 * `instrumentation-client.ts`. Server code lives in `@observe/next/server` and `@observe/next/route`.
 */
export { Observe } from "./client.js";
export type { ObserveProps } from "./client.js";
export { initObserve } from "./init.js";
export type * from "./types.js";
