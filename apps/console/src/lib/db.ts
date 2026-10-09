import "server-only";

/**
 * The database for a deployed console: Supabase Postgres, reached over PostgREST through RPC functions that
 * check a secret token (supabase/migrations in this app). Tables live in a schema the API does not expose, so
 * the publishable key alone reads nothing.
 *
 * Raw sensor batches are stored as they arrive and replayed into memory by `syncStore`, so every server
 * instance builds the same sessions with the same ingest code. Jev's answers are stored too, so a session is
 * asked once and every instance shows the same verdict.
 *
 * Without SUPABASE_URL, SUPABASE_KEY and OBSERVE_DB_TOKEN the console keeps everything in memory, as in development.
 */

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_KEY;
const TOKEN = process.env.OBSERVE_DB_TOKEN;
const TIMEOUT_MS = 8_000;

export const dbConfigured = Boolean(URL_BASE && KEY && TOKEN);

/**
 * Whether this server may write. A development console pointed at the pilot's database to show its data
 * (OBSERVE_DB_READONLY=1) keeps its own test sessions in memory instead.
 */
export const dbWritable = dbConfigured && process.env.OBSERVE_DB_READONLY !== "1";

/** What the server saw about the request that carried a batch. */
export interface BatchMeta {
  ua?: string;
  country?: string;
  /** `Signature-Agent` header: the agent says it signs its requests (Web Bot Auth). Not verified here. */
  signatureAgent?: string;
  /** Set only by /api/v1/decide: the batch holds decisions the site's own server asked for, not sensor data. */
  server?: true;
}

export interface StoredBatch {
  id: number;
  site: string;
  session_id: string;
  received_at: number;
  meta: BatchMeta;
  body: unknown;
}

export interface StoredJev {
  site: string;
  session_id: string;
  answer: unknown;
  fingerprint: string;
  updated_at: number;
}

export interface StoredSite {
  id: string;
  name: string;
  host: string;
  environment: string;
  anonymous: boolean;
  publishable_key: string;
  secret_key_hash: string;
}

/** An agent price (src/lib/pricing.ts), in millionths of a dollar. Postgres bigints arrive as numbers or strings. */
export interface StoredPrice {
  site: string;
  action_id: string;
  amount_micro: number | string;
  currency: string;
}

/** A site's rule for one agent (or group of agents) and scope (src/lib/agent-rules.ts). */
export interface StoredAgentRule {
  site: string;
  subject: string;
  scope: string;
  choice: string;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: TOKEN, ...args }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${fn} returned ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Store a batch as the sensor sent it. The `lab` raw-event stream (pointer, key and wheel timings, sent only in lab
 * capture) is kept for test sites such as the agent lab and dropped everywhere else.
 */
export function putBatch(siteId: string, sessionId: string, receivedAt: number, meta: BatchMeta, body: unknown, keepLab = false): Promise<number> {
  const { lab, ...kept } = body as Record<string, unknown>;
  const stored = keepLab && Array.isArray(lab) && lab.length ? { ...kept, lab } : kept;
  return rpc("observe_put_batch_v2", { p_site: siteId, p_session_id: sessionId, p_received_at: receivedAt, p_meta: meta, p_body: stored });
}

/** Batches of every site this console may see, stored after `afterId` and received at or after `since`, oldest first. */
export function batchesAfter(afterId: number, since: number, limit: number): Promise<StoredBatch[]> {
  return rpc("observe_batches_v2", { p_after: afterId, p_since: since, p_limit: limit });
}

export function putJev(siteId: string, sessionId: string, answer: unknown, fingerprint: string, updatedAt: number): Promise<void> {
  return rpc("observe_put_jev_v2", { p_site: siteId, p_session_id: sessionId, p_answer: answer, p_fingerprint: fingerprint, p_updated_at: updatedAt });
}

/** Jev answers stored or replaced after `after` (ms epoch), oldest first. */
export function jevAfter(after: number): Promise<StoredJev[]> {
  return rpc("observe_jev_v2", { p_after: after });
}

export function listSites(): Promise<StoredSite[]> {
  return rpc("observe_sites_v2", {});
}

export function createSite(site: StoredSite): Promise<void> {
  return rpc("observe_create_site_v2", {
    p_id: site.id,
    p_name: site.name,
    p_host: site.host,
    p_environment: site.environment,
    p_anonymous: site.anonymous,
    p_publishable_key: site.publishable_key,
    p_secret_key_hash: site.secret_key_hash,
  });
}

export function setSecretHash(siteId: string, secretKeyHash: string): Promise<void> {
  return rpc("observe_set_secret_v2", { p_id: siteId, p_secret_key_hash: secretKeyHash });
}

export function listPrices(): Promise<StoredPrice[]> {
  return rpc("observe_prices_v2", {});
}

/** Set what agents pay for an action on a site; null removes the price. */
export function setPrice(siteId: string, actionId: string, micro: number | null): Promise<void> {
  return rpc("observe_set_price_v2", { p_site: siteId, p_action_id: actionId, p_amount_micro: micro ?? 0 });
}

/** An agent rate (src/lib/pricing.ts): per hour of agent time or per agent session, in millionths of a dollar. */
export interface StoredRate {
  site: string;
  unit: string;
  amount_micro: number | string;
}

export function listRates(): Promise<StoredRate[]> {
  return rpc("observe_agent_rates_v2", {});
}

/** Set what agents pay per hour or per session on a site; null removes the rate. */
export function setRate(siteId: string, unit: "hour" | "session", micro: number | null): Promise<void> {
  return rpc("observe_set_agent_rate_v2", { p_site: siteId, p_unit: unit, p_amount_micro: micro ?? 0 });
}

export function listAgentRules(): Promise<StoredAgentRule[]> {
  return rpc("observe_agent_rules_v2", {});
}

/** Set what an agent (a driver id) or group of agents may do with a scope on a site; null removes the rule. */
export function setAgentRule(siteId: string, subject: string, scope: string, choice: string | null): Promise<void> {
  return rpc("observe_set_agent_rule_v2", { p_site: siteId, p_subject: subject, p_scope: scope, p_choice: choice });
}
