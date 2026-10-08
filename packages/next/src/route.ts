/**
 * `@observe/next/route`: the first-party forwarding route. Mount it at `app/%5Fobserve/[...path]/route.ts`
 * (`%5F` is an underscore: a plain `_observe` folder is private in the App Router and never routed):
 *
 *   export { GET, POST } from "@observe/next/route";
 *
 * - `GET  /_observe/s.js`            the console's current sensor, cached 5 minutes
 * - `POST /_observe/v1/sdk/events`   forwarded to `{OBSERVE_URL}/api/v1/sdk/events` with an allowlist of headers
 *
 * No Next.js imports, so the handlers also work as plain `(Request) => Response` functions in other runtimes.
 */
import { observeUrl, withTimeout } from "./config.js";

/** The only request headers that reach the console. Never `cookie` or `authorization`. */
export const FORWARDED_HEADERS = [
  "content-type",
  "user-agent",
  "x-vercel-ip-country",
  "signature-agent",
  "signature",
  "signature-input",
] as const;

/** Largest batch forwarded, in bytes (the collector's own limit). */
export const MAX_BODY_BYTES = 256_000;

const SCRIPT_CACHE_SECONDS = 300;
const SCRIPT_TIMEOUT_MS = 5000;
const EVENTS_TIMEOUT_MS = 2000;

/** Served when the console's sensor can't be fetched, so the page never breaks. */
const NOOP_SCRIPT = "/* observe: unavailable */\n";

type Params = { path?: string | string[] };
/** Next 15+ passes `params` as a promise, Next 14 as an object. */
export interface RouteContext {
  params?: Promise<Params> | Params;
}

async function subPath(request: Request, ctx?: RouteContext): Promise<string> {
  const params = ctx?.params ? await ctx.params : undefined;
  const p = params?.path;
  if (Array.isArray(p)) return p.join("/");
  if (typeof p === "string") return p;
  // Called without route params (another framework, a test): match on the end of the URL.
  const pathname = new URL(request.url).pathname;
  if (pathname.endsWith("/s.js")) return "s.js";
  if (pathname.endsWith("/v1/sdk/events")) return "v1/sdk/events";
  return pathname;
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}

function noopScript(): Response {
  return new Response(NOOP_SCRIPT, {
    status: 200,
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}

/** `GET /_observe/s.js`: the console's current sensor (`/sensor/v1/observe.min.js`). */
export async function GET(request: Request, ctx?: RouteContext): Promise<Response> {
  if ((await subPath(request, ctx)) !== "s.js") return notFound();
  try {
    const script = await withTimeout(SCRIPT_TIMEOUT_MS, async (signal) => {
      const res = await fetch(`${observeUrl()}/sensor/v1/observe.min.js`, {
        signal,
        // Next.js data cache: one upstream fetch per 5 minutes per deployment.
        next: { revalidate: SCRIPT_CACHE_SECONDS },
      } as RequestInit);
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return null;
      }
      return await res.text();
    });
    if (script === null) return noopScript();
    return new Response(script, {
      status: 200,
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": `public, max-age=${SCRIPT_CACHE_SECONDS}`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return noopScript();
  }
}

/** Read at most `limit` bytes of the body; `null` when it is larger. */
async function readBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function tooLarge(): Response {
  return new Response("Batch too large", { status: 413, headers: { "cache-control": "no-store" } });
}

/** `POST /_observe/v1/sdk/events`: forward a sensor batch and return the console's answer (the token). */
export async function POST(request: Request, ctx?: RouteContext): Promise<Response> {
  if ((await subPath(request, ctx)) !== "v1/sdk/events") return notFound();

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();
  let body: Uint8Array<ArrayBuffer> | null;
  try {
    body = await readBody(request, MAX_BODY_BYTES);
  } catch {
    return new Response("Could not read body", { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (body === null) return tooLarge();

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const v = request.headers.get(name);
    // Vercel replaces x-vercel-ip-country on the request reaching the console with this server's own region,
    // so the visitor's country travels under a header it leaves alone.
    if (v !== null) headers.set(name === "x-vercel-ip-country" ? "x-observe-country" : name, v);
  }

  try {
    return await withTimeout(EVENTS_TIMEOUT_MS, async (signal) => {
      const res = await fetch(`${observeUrl()}/api/v1/sdk/events`, {
        method: "POST",
        headers,
        body,
        cache: "no-store",
        redirect: "error",
        signal,
      });
      const out = new Headers({ "cache-control": "no-store" });
      const type = res.headers.get("content-type");
      if (type) out.set("content-type", type);
      // Null-body statuses (204, 205, 304) can't carry one.
      if (res.status === 204 || res.status === 205 || res.status === 304) {
        await res.body?.cancel().catch(() => {});
        return new Response(null, { status: res.status, headers: out });
      }
      return new Response(await res.text(), { status: res.status, headers: out });
    });
  } catch {
    // Timeout or network error: the sensor carries on without a token.
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
}
