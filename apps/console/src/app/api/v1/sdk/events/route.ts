import { after } from "next/server";

import { classifyIfDue } from "@/lib/classify";
import { ingest, parseBatch } from "@/lib/ingest";

/** Collector endpoint for `@observe/sensor`. Point the sensor's `endpoint` at `<console>/api`. */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // The sensor sends its key in this header as well as in the body, which makes browsers preflight.
  "Access-Control-Allow-Headers": "Content-Type, X-Observe-Key",
  "Access-Control-Max-Age": "86400",
};

const MAX_BODY = 256_000;

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
  ingest(batch, Date.now());
  // Ask Jev once the response has gone, so the sensor never waits on it.
  after(() => classifyIfDue(batch.sessionId));
  return new Response(null, { status: 204, headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
