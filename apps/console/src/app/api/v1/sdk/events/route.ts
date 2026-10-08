import { after } from "next/server";

import { classifyIfDue } from "@/lib/classify";
import { dbWritable, putBatch, type BatchMeta } from "@/lib/db";
import { ingest, parseBatch } from "@/lib/ingest";
import { saveResult } from "@/lib/results";
import { siteForKey } from "@/lib/site";
import { store } from "@/lib/store";
import { syncStore } from "@/lib/sync";

/**
 * Collector endpoint for `@observe/sensor`. Point the sensor's `endpoint` at `<console>/api`, or proxy a path on
 * the customer's own domain to it (a rewrite), so the page only ever talks to itself.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // The sensor sends its key in this header as well as in the body, which makes browsers preflight.
  "Access-Control-Allow-Headers": "Content-Type, X-Observe-Key",
  "Access-Control-Max-Age": "86400",
};

const MAX_BODY = 256_000;

function metaFrom(req: Request): BatchMeta {
  const h = req.headers;
  const meta: BatchMeta = {};
  const ua = h.get("user-agent");
  const country = h.get("x-vercel-ip-country");
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
  const site = siteForKey((body as { key?: unknown }).key);
  if (!site) return new Response("Unknown key", { status: 403, headers: CORS });

  const meta = metaFrom(req);
  if (site.stored && dbWritable) {
    // Store it; the replay after the response brings it (and anything other instances stored) into memory.
    try {
      await putBatch(batch.sessionId, Date.now(), meta, body);
    } catch (e) {
      console.error("[observe] could not store batch:", e instanceof Error ? e.message : e);
      return new Response("Could not store batch", { status: 503, headers: CORS });
    }
  } else {
    ingest(batch, Date.now(), meta, site.id);
  }

  // Once the response has gone, so the sensor never waits: catch up with the database, save labelled test runs,
  // then ask Jev.
  after(async () => {
    await syncStore(true);
    const rec = store.sensor.get(batch.sessionId);
    if (rec) await saveResult(rec);
    await classifyIfDue(batch.sessionId);
  });
  return new Response(null, { status: 204, headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
