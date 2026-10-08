/**
 * The sites this console watches, each with its own sessions and keys (docs/install.md):
 * - Sites in the database, added with "Add a site". `syncStore` keeps this list current.
 * - Ledgerline, the demo: a made-up finance SaaS with generated traffic. On unless OBSERVE_DEMO=0.
 * - In development without a database, one site from the environment (OBSERVE_SITE_KEY, OBSERVE_SITE_ID,
 *   OBSERVE_SITE_NAME, OBSERVE_SITE_HOST, OBSERVE_SITE_ENV, OBSERVE_SITE_ANONYMOUS=1), kept in memory.
 *
 * The sensor's publishable key says which site a batch belongs to; a site's secret key (stored only as a hash)
 * authenticates its server to /api/v1/decide.
 */
import type { StoredSite } from "./db";

const env = process.env;

export interface Site {
  id: string;
  name: string;
  host: string;
  environment: string;
  publishableKey: string;
  /** Generated demo traffic alongside what the sensor reports. */
  demo: boolean;
  /** Visitors are not signed in (a marketing site), so there are no accounts or people to name. */
  anonymous: boolean;
  /** Sessions go through the database rather than living only in this server's memory. */
  stored: boolean;
  /** SHA-256 of the secret key, hex; null when the site has none (the demo). */
  secretKeyHash: string | null;
}

const DEMO: Site = {
  id: "ledgerline",
  name: "Ledgerline",
  host: "app.ledgerline.com",
  environment: "Demo",
  publishableKey: "pk_demo_7f3a21c4e0b94d1a",
  demo: true,
  anonymous: false,
  stored: false,
  secretKeyHash: null,
};

const FROM_ENV: Site | null = env.OBSERVE_SITE_KEY
  ? {
      id: env.OBSERVE_SITE_ID || "site",
      name: env.OBSERVE_SITE_NAME || env.OBSERVE_SITE_HOST || "Your site",
      host: env.OBSERVE_SITE_HOST || "",
      environment: env.OBSERVE_SITE_ENV || "Production",
      publishableKey: env.OBSERVE_SITE_KEY,
      demo: false,
      anonymous: env.OBSERVE_SITE_ANONYMOUS === "1",
      stored: false,
      secretKeyHash: env.OBSERVE_SITE_SECRET_HASH || null,
    }
  : null;

const SHOW_DEMO = env.OBSERVE_DEMO !== "0";

// On globalThis so a dev-server reload keeps what the last sync loaded.
const g = globalThis as unknown as { __observeSites?: Site[] };
g.__observeSites ??= [];

/** Replace the database's sites (called by `syncStore`). */
export function setStoredSites(rows: StoredSite[]): void {
  g.__observeSites = rows.map((r) => ({
    id: r.id,
    name: r.name,
    host: r.host,
    environment: r.environment,
    publishableKey: r.publishable_key,
    demo: false,
    anonymous: r.anonymous,
    stored: true,
    secretKeyHash: r.secret_key_hash,
  }));
}

/** Every site, real ones first (the first is the default), the demo last. */
export function allSites(): Site[] {
  const stored = g.__observeSites!;
  const extra = FROM_ENV && !stored.some((s) => s.id === FROM_ENV.id) ? [FROM_ENV] : [];
  return [...stored, ...extra, ...(SHOW_DEMO ? [DEMO] : [])];
}

/** The site shown when none is chosen. Falls back to the demo so the console always has one. */
export function defaultSite(): Site {
  return allSites()[0] ?? DEMO;
}

export function siteById(id: string | null | undefined): Site | undefined {
  return allSites().find((s) => s.id === id);
}

/**
 * The site a sensor batch belongs to. In development, batches with no key or an unknown one (the sensor demo page
 * sends none) go to the demo site; a deployed console refuses them.
 */
export function siteForKey(key: unknown): Site | undefined {
  const known = allSites().find((s) => s.publishableKey === key);
  if (known) return known;
  return env.NODE_ENV === "production" ? undefined : SHOW_DEMO ? DEMO : undefined;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The site a secret key belongs to (compared by hash), or undefined. */
export async function siteForSecret(secret: string | null | undefined): Promise<Site | undefined> {
  if (!secret || !/^sk_[a-z0-9-]+_[0-9a-f]{32}$/.test(secret)) return undefined;
  const hash = await sha256Hex(secret);
  return allSites().find((s) => s.secretKeyHash !== null && s.secretKeyHash === hash);
}
