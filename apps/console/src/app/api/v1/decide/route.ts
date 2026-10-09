import { ruleFor } from "@/lib/agent-rules";
import { getDriver } from "@/lib/catalog";
import { dbWritable, putBatch } from "@/lib/db";
import { actionFor, ingest, parseBatch } from "@/lib/ingest";
import { decide } from "@/lib/policy";
import { MICRO, formatPrice, priceFor } from "@/lib/pricing";
import { siteForSecret } from "@/lib/site";
import { store } from "@/lib/store";
import { syncStore } from "@/lib/sync";
import { checkToken } from "@/lib/token";
import type { Tier, Verdict } from "@/lib/types";

/**
 * The site's server asks what to do with a protected action (docs/install.md). It authenticates with the site's
 * secret key and passes the session token the page attached (`x-observe-token`). The browser's own verdict is
 * never trusted: the answer comes from what this console decided about the session.
 *
 * Observe mode: nothing is enforced. `outcome` is what the rules would do; the caller may act on it. When the site
 * charges agents for the action (agent pricing) and this agent may go ahead, `outcome` is `bill` and `price` says
 * how much; the site collects it however it likes (an API key, a 402 Payment Required, an invoice to the operator).
 */

const ACTION_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  await syncStore();
  const site = await siteForSecret(bearer(req));
  if (!site) return Response.json({ error: "Unknown or missing secret key." }, { status: 401 });

  let body: { token?: unknown; action?: unknown; method?: unknown; path?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (typeof body.action !== "string" || !ACTION_ID.test(body.action)) {
    return Response.json({ error: "`action` must be 1-64 letters, digits, _ . : or -." }, { status: 400 });
  }
  const method = typeof body.method === "string" ? body.method.slice(0, 10).toUpperCase() : null;
  const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path.slice(0, 300) : "/";

  const now = Date.now();
  const check = await checkToken(body.token, site.id, now);
  const rec = check.status === "valid" ? store.sensor.get(check.payload.s) : undefined;
  const session = rec && rec.site === site.id ? rec.session : undefined;

  const verdict: Verdict = session?.verdict ?? "unknown";
  const tier: Tier = session?.tier ?? "unknown";
  const action = actionFor(body.action, path);
  // The site's own rule for this agent, or its kind of agent, when it set one on the Rules page.
  const rule = session ? ruleFor(site.id, session, action.scope) : null;
  const { outcome, policy, price } = decide(tier, action, priceFor(site.id, action.id), rule);
  const driver = verdict === "agent" && session?.driverId ? getDriver(session.driverId) : undefined;

  // Mark the action on the session, through the same stored-batch path as sensor data so every instance sees it.
  if (session) {
    const raw = { v: 1, key: site.publishableKey, sessionId: session.id, pageId: "server", page: path, deviceId: "server", records: [{ type: "decision", t: 0, actionId: body.action }] };
    try {
      if (site.stored && dbWritable) {
        await putBatch(site.id, session.id, now, { server: true }, raw);
        await syncStore(true);
      } else {
        const batch = parseBatch(raw);
        if (batch) ingest(batch, now, { server: true }, site.id);
      }
    } catch (e) {
      console.error("[observe] could not record decision:", e instanceof Error ? e.message : e);
    }
  }

  return Response.json(
    {
      mode: "observe",
      sessionId: session?.id ?? null,
      verdict,
      tier,
      driver: driver ? { id: driver.id, name: driver.name, provider: driver.provider } : null,
      confidence: session?.confidence ?? 0,
      decidedBy: session?.decidedBy ?? null,
      action: { id: action.id, label: action.label, scope: action.scope },
      method,
      outcome,
      wouldBlock: outcome === "refuse",
      price: price ? { amount: price / MICRO, currency: "USD", display: formatPrice(price) } : null,
      policy,
      token: check.status,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
