import { after } from "next/server";

import { classifyIfDue } from "@/lib/classify";
import { dbWritable, putBatch, type BatchMeta } from "@/lib/db";
import { ingest, parseBatch } from "@/lib/ingest";
import { RateLimit } from "@/lib/rate-limit";
import { saveResult } from "@/lib/results";
import { siteForKey } from "@/lib/site";
import { store } from "@/lib/store";
import { ensureSites, syncStore } from "@/lib/sync";
import { issueToken } from "@/lib/token";

/**
 * Collector endpoint for `@observe/sensor` (docs/install.md). Sites send here through a path on their own domain
 * (a rewrite or `@observe/next`'s forwarder), so the page only talks to itself. The reply carries a signed,
 * short-lived session token the page attaches to protected requests; the site's server checks it with
 * /api/v1/decide.
 *
 * Only the user agent, country and Web Bot Auth headers are read from the request. Cookies and IP addresses are
 * never stored.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // The sensor sends its key in this header as well as in the body, which makes browsers preflight.
  "Access-Control-Allow-Headers": "Content-Type, X-Observe-Key",
  "Access-Control-Max-Age": "86400",
};

const MAX_BODY = 256_000;

/** A sensor flushes every few seconds; two batches a second for a minute is already far more than one tab sends. */
const perSession = new RateLimit(120, 60_000);

function metaFrom(req: Request): BatchMeta {
  const h = req.headers;
  const meta: BatchMeta = {};
  const ua = h.get("user-agent");
  // A forwarder (`@observe/next`) passes the visitor's country as x-observe-country, since Vercel overwrites its own.
  const country = h.get("x-observe-country") ?? h.get("x-vercel-ip-country");
  const signatureAgent = h.get("signature-agent");
  if (ua) meta.ua = ua.slice(0, 300);
  if (country) meta.country = country.slice(0, 8);
  if (signatureAgent) meta.signatureAgent = signatureAgent.slice(0, 160);
  return meta;
}

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return new Response("Batch too large", { status: 413, headers: CORS });
  const text = await req.text();
  if (text.length > MAX_BODY) return new Response("Batch too large", { status: 413, headers: CORS });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response("Body must be JSON", { status: 400, headers: CORS });
  }
  const batch = parseBatch(body);
  if (!batch) return new Response("Not a sensor batch", { status: 422, headers: CORS });

  // The key says which site this is. A deployed console takes only its sites' keys; locally the demo takes the rest.
  await ensureSites();
  const site = siteForKey((body as { key?: unknown }).key);
  if (!site) return new Response("Unknown key", { status: 403, headers: CORS });
  if (!perSession.take(`${site.id}:${batch.sessionId}`)) return new Response("Too many batches", { status: 429, headers: CORS });

  const now = Date.now();
  const meta = metaFrom(req);
  if (site.stored && dbWritable) {
    // Store it; the replay after the response brings it (and anything other instances stored) into memory.
    try {
      await putBatch(site.id, batch.sessionId, now, meta, body, site.environment === "Test");
    } catch (e) {
      console.error("[observe] could not store batch:", e instanceof Error ? e.message : e);
      return new Response("Could not store batch", { status: 503, headers: CORS });
    }
  } else {
    ingest(batch, now, meta, site.id);
  }

  // Once the response has gone, so the sensor never waits: catch up with the database, save labelled test runs,
  // then ask Jev.
  after(async () => {
    await syncStore(true);
    const rec = store.sensor.get(batch.sessionId);
    if (rec) await saveResult(rec);
    await classifyIfDue(batch.sessionId);
  });
  return Response.json(await issueToken(batch.sessionId, site.id, now), { headers: { ...CORS, "Cache-Control": "no-store" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
