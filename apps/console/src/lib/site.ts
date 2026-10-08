/**
 * The sites this console watches, each with its own sessions:
 * - Ledgerline, the demo: a made-up finance SaaS with generated traffic (agents reading reports, chasing invoices,
 *   running payroll). On unless OBSERVE_DEMO=0.
 * - A real site, when OBSERVE_SITE_KEY is set (the arzach.ai pilot): OBSERVE_SITE_ID, OBSERVE_SITE_NAME,
 *   OBSERVE_SITE_HOST, OBSERVE_SITE_ENV, OBSERVE_SITE_ANONYMOUS=1 when visitors are not signed in. With a database
 *   configured its sessions are stored and shared by every server instance.
 *
 * The sensor's publishable key says which site a batch belongs to.
 */
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
}

const dbConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_KEY && env.OBSERVE_DB_TOKEN);

const DEMO: Site = {
  id: "ledgerline",
  name: "Ledgerline",
  host: "app.ledgerline.com",
  environment: "Demo",
  publishableKey: "pk_demo_7f3a21c4e0b94d1a",
  demo: true,
  anonymous: false,
  stored: false,
};

const REAL: Site | null = env.OBSERVE_SITE_KEY
  ? {
      id: env.OBSERVE_SITE_ID || "site",
      name: env.OBSERVE_SITE_NAME || env.OBSERVE_SITE_HOST || "Your site",
      host: env.OBSERVE_SITE_HOST || "",
      environment: env.OBSERVE_SITE_ENV || "Production",
      publishableKey: env.OBSERVE_SITE_KEY,
      demo: false,
      anonymous: env.OBSERVE_SITE_ANONYMOUS === "1",
      stored: dbConfigured,
    }
  : null;

/** The real site first, so it is the default. */
export const SITES: Site[] = [...(REAL ? [REAL] : []), ...(env.OBSERVE_DEMO === "0" ? [] : [DEMO])];

if (SITES.length === 0) throw new Error("No sites: set OBSERVE_SITE_KEY or leave the demo on (OBSERVE_DEMO unset).");

export const DEFAULT_SITE: Site = SITES[0]!;

export function siteById(id: string | null | undefined): Site | undefined {
  return SITES.find((s) => s.id === id);
}

/**
 * The site a sensor batch belongs to. In development, batches with no key or an unknown one (the sensor demo page
 * sends none) go to the demo site; a deployed console refuses them.
 */
export function siteForKey(key: unknown): Site | undefined {
  const known = SITES.find((s) => s.publishableKey === key);
  if (known) return known;
  return env.NODE_ENV === "production" ? undefined : SITES.find((s) => s.demo);
}
