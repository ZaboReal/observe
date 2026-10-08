import { DRIVERS as SENSOR_DRIVERS } from "@observe/sensor";
import { hash, mulberry32, pick } from "./random";
import type { Account, ActionDef, Driver, Risk, Scope, User } from "./types";

/**
 * Drivers in the demo traffic mix. Ids and names match the sensor registry (`@observe/sensor`);
 * `share` is the demo mix, not a measurement.
 */
export const DRIVERS: (Driver & { share: number })[] = [
  { id: "claude-in-chrome", name: "Claude in Chrome", provider: "Anthropic", kind: "extension", tier: "recognised", share: 30 },
  { id: "comet", name: "Perplexity Comet", provider: "Perplexity", kind: "agentic-browser", tier: "recognised", share: 17 },
  { id: "chatgpt-extension", name: "ChatGPT for Chrome", provider: "OpenAI", kind: "extension", tier: "recognised", share: 13 },
  { id: "gemini-in-chrome", name: "Gemini in Chrome", provider: "Google", kind: "built-in-agent", tier: "recognised", share: 10 },
  { id: "chatgpt-agent", name: "ChatGPT agent", provider: "OpenAI", kind: "cloud-browser", tier: "verified", share: 7 },
  { id: "openclaw", name: "OpenClaw", provider: "OpenClaw", kind: "extension", tier: "recognised", share: 5 },
  { id: "manus-operator", name: "Manus Browser Operator", provider: "Manus", kind: "extension", tier: "recognised", share: 4 },
  { id: "browser-use", name: "browser-use", provider: "Browser Use", kind: "framework", tier: "recognised", share: 4 },
  { id: "stagehand", name: "Stagehand / Browserbase", provider: "Browserbase", kind: "cloud-browser", tier: "verified", share: 3 },
  { id: "edge-copilot", name: "Edge Copilot Mode", provider: "Microsoft", kind: "built-in-agent", tier: "recognised", share: 2 },
  { id: "playwright", name: "Playwright", provider: "Microsoft", kind: "framework", tier: "recognised", share: 2 },
];

/** Agent sessions we are sure are automated but cannot name. */
export const UNNAMED_SHARE = 5;

/** URL and filter key for agent sessions with no named driver. */
export const UNNAMED_ID = "unnamed";

/** Cloud agents that sign their requests (Web Bot Auth), so their sessions can be verified rather than recognised. */
const SIGNING = new Set(["chatgpt-agent", "google-agent", "stagehand", "cloudflare-browser-run"]);

const driverById = new Map<string, Driver & { share: number }>(DRIVERS.map((d) => [d.id, d]));
// Everything else the sensor's registry can name, so sessions it reports are labelled even without demo traffic.
for (const d of SENSOR_DRIVERS) {
  if (driverById.has(d.id)) continue;
  driverById.set(d.id, { id: d.id, name: d.name, provider: d.provider, kind: d.kind, tier: SIGNING.has(d.id) ? "verified" : "recognised", share: 0 });
}

export function getDriver(id: string | null | undefined): (Driver & { share: number }) | undefined {
  return id ? driverById.get(id) : undefined;
}

/** Every driver the console can name, demo traffic first. */
export function allDrivers(): (Driver & { share: number })[] {
  return [...driverById.values()];
}

/** Look up a driver id from the sensor, adding a placeholder for one this catalogue has not heard of. */
export function ensureDriver(id: string): Driver {
  const known = driverById.get(id);
  if (known) return known;
  const name = id.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const driver = { id, name, provider: "Unknown", kind: "extension" as const, tier: "recognised" as const, share: 0 };
  if (driverById.size < 500) driverById.set(id, driver);
  return driver;
}

/** Drivers that run in the person's own browser and so can take over a session they started. */
export function canTakeOver(driver: Driver): boolean {
  return driver.kind === "extension" || driver.kind === "agentic-browser" || driver.kind === "built-in-agent";
}

export const SCOPES: { id: Scope; label: string; risk: Risk }[] = [
  { id: "view", label: "View", risk: "low" },
  { id: "export", label: "Export", risk: "medium" },
  { id: "edit", label: "Create & edit", risk: "medium" },
  { id: "invite", label: "Invite & share", risk: "medium" },
  { id: "send", label: "Send", risk: "medium" },
  { id: "pay", label: "Pay & payroll", risk: "high" },
  { id: "settings", label: "Settings & admin", risk: "high" },
  { id: "delete", label: "Delete", risk: "critical" },
];

export const ACTIONS: ActionDef[] = [
  { id: "view_dashboard", label: "View dashboard", method: "GET", path: "/api/dashboard", route: "/dashboard", scope: "view", risk: "low" },
  { id: "view_report", label: "View report", method: "GET", path: "/api/reports/:id", route: "/reports", scope: "view", risk: "low" },
  { id: "search_invoices", label: "Search invoices", method: "GET", path: "/api/invoices", route: "/invoices", scope: "view", risk: "low" },
  { id: "view_customer", label: "View customer", method: "GET", path: "/api/customers/:id", route: "/customers", scope: "view", risk: "low" },
  { id: "export_report", label: "Export report", method: "POST", path: "/api/reports/export", route: "/reports", scope: "export", risk: "medium" },
  { id: "export_invoices", label: "Export invoices", method: "POST", path: "/api/invoices/export", route: "/invoices", scope: "export", risk: "medium" },
  { id: "export_customers", label: "Export customer list", method: "POST", path: "/api/customers/export", route: "/customers", scope: "export", risk: "medium" },
  { id: "create_invoice", label: "Create invoice", method: "POST", path: "/api/invoices", route: "/invoices", scope: "edit", risk: "medium" },
  { id: "edit_invoice", label: "Edit invoice", method: "PATCH", path: "/api/invoices/:id", route: "/invoices", scope: "edit", risk: "medium" },
  { id: "update_customer", label: "Update customer", method: "PATCH", path: "/api/customers/:id", route: "/customers", scope: "edit", risk: "medium" },
  { id: "invite_member", label: "Invite teammate", method: "POST", path: "/api/team/invites", route: "/settings/team", scope: "invite", risk: "medium" },
  { id: "share_report", label: "Share report link", method: "POST", path: "/api/reports/:id/share", route: "/reports", scope: "invite", risk: "medium" },
  { id: "send_invoice", label: "Send invoice", method: "POST", path: "/api/invoices/:id/send", route: "/invoices", scope: "send", risk: "medium" },
  { id: "run_payroll", label: "Run payroll", method: "POST", path: "/api/payroll/runs", route: "/payroll", scope: "pay", risk: "high" },
  { id: "issue_refund", label: "Issue refund", method: "POST", path: "/api/payments/refunds", route: "/payments", scope: "pay", risk: "high" },
  { id: "change_sso", label: "Change SSO settings", method: "PATCH", path: "/api/settings/sso", route: "/settings/security", scope: "settings", risk: "high" },
  { id: "create_api_key", label: "Create API key", method: "POST", path: "/api/settings/api-keys", route: "/settings/api-keys", scope: "settings", risk: "high" },
  { id: "change_role", label: "Change member role", method: "PATCH", path: "/api/team/members/:id", route: "/settings/team", scope: "settings", risk: "high" },
  { id: "delete_customer", label: "Delete customer", method: "DELETE", path: "/api/customers/:id", route: "/customers", scope: "delete", risk: "critical" },
  { id: "delete_invoices", label: "Bulk delete invoices", method: "DELETE", path: "/api/invoices", route: "/invoices", scope: "delete", risk: "critical" },
];

/**
 * Actions real sites mark with `sensor.protect(id)` that the demo never generates. arzach.ai (the pilot) marks
 * signing up for early access and downloading a paper.
 */
export const SITE_ACTIONS: ActionDef[] = [
  { id: "sign_up", label: "Sign up for early access", method: "POST", path: "/signup", route: "/", scope: "send", risk: "medium" },
  { id: "download_paper", label: "Download a paper", method: "GET", path: "/assets/papers/:file", route: "/research/", scope: "export", risk: "low" },
];

const actionById = new Map(ACTIONS.map((a) => [a.id, a]));

export function getAction(id: string): ActionDef {
  const action = actionById.get(id);
  if (!action) throw new Error(`Unknown action ${id}`);
  return action;
}

const ACCOUNT_SEED: [string, string, Account["plan"], number, number][] = [
  // name, domain, plan, seats, agent affinity (0..1): how heavily the workspace uses agents
  ["Northwind", "northwind.co", "Enterprise", 46, 0.55],
  ["Halcyon Freight", "halcyonfreight.com", "Growth", 22, 0.3],
  ["Brightwater Dental", "brightwaterdental.com", "Starter", 8, 0.08],
  ["Kestrel Analytics", "kestrel.ai", "Growth", 18, 0.9],
  ["Juniper & Co", "juniperandco.com", "Starter", 6, 0.2],
  ["Corvid Labs", "corvidlabs.dev", "Growth", 14, 1],
  ["Meridian Health", "meridianhealth.org", "Enterprise", 38, 0.12],
  ["Tallow Supply", "tallowsupply.com", "Starter", 9, 0.15],
  ["Oakline Capital", "oaklinecap.com", "Enterprise", 27, 0.65],
  ["Fenwick Legal", "fenwicklegal.com", "Growth", 16, 0.25],
  ["Pinecrest Schools", "pinecrest.edu", "Growth", 24, 0.05],
  ["Arbor Logistics", "arborlogistics.com", "Growth", 20, 0.35],
  ["Lumen Studio", "lumen.studio", "Starter", 7, 0.7],
  ["Saltmarsh Foods", "saltmarshfoods.com", "Starter", 11, 0.1],
  ["Quarry Robotics", "quarryrobotics.com", "Growth", 15, 0.85],
  ["Bellweather Insurance", "bellweather.com", "Enterprise", 41, 0.2],
  ["Ridgeway Property", "ridgewayproperty.com", "Starter", 10, 0.3],
  ["Marigold Retail", "marigoldretail.com", "Growth", 19, 0.4],
  ["Driftwood Media", "driftwood.media", "Starter", 8, 0.6],
  ["Ironbark Construction", "ironbark.build", "Growth", 17, 0.1],
  ["Vellum Publishing", "vellumpub.com", "Starter", 9, 0.45],
  ["Tidewater Clinics", "tidewaterclinics.com", "Enterprise", 33, 0.15],
];

const FIRST = [
  "morgan", "alex", "sam", "jordan", "taylor", "casey", "riley", "jamie", "avery", "quinn", "rowan", "harper",
  "noor", "priya", "mateo", "lucia", "kenji", "amara", "elena", "tomas", "ines", "omar", "leila", "dmitri",
  "sofia", "arjun", "maya", "felix", "hana", "yusuf", "clara", "jonas", "ada", "ravi", "zoe", "malik",
];
const LAST = [
  "lee", "patel", "garcia", "nguyen", "okafor", "silva", "kim", "novak", "haddad", "brennan", "costa", "sato",
  "mensah", "lind", "ferreira", "ahmed", "kowalski", "rossi", "bauer", "moreau", "chen", "ortiz", "walsh", "dubois",
];

export interface AccountProfile extends Account {
  agentAffinity: number;
}

export interface UserProfile extends User {
  /** How likely this person is to hand work to an agent, 0..1. */
  agentAffinity: number;
  /** The agent this person usually uses. */
  preferredDriver: string;
}

function build() {
  const accounts: AccountProfile[] = ACCOUNT_SEED.map(([name, domain, plan, seats, agentAffinity]) => ({
    id: `acct_${domain.split(".")[0]!.replace(/[^a-z]/g, "")}`,
    name,
    domain,
    plan,
    seats,
    agentAffinity,
  }));

  const users: UserProfile[] = [];
  for (const account of accounts) {
    const rng = mulberry32(hash(account.id));
    const used = new Set<string>();
    for (let i = 0; i < account.seats; i++) {
      let local = "";
      do {
        const first = pick(rng, FIRST);
        local = used.size % 3 === 0 ? first : `${first}.${pick(rng, LAST)}`;
      } while (used.has(local));
      used.add(local);
      const name = local
        .split(".")
        .map((part) => part[0]!.toUpperCase() + part.slice(1))
        .join(" ");
      // A few people per workspace do most of the agent work.
      const enthusiast = rng() < 0.18;
      users.push({
        id: `usr_${hash(`${account.id}:${local}`).toString(36)}`,
        email: `${local}@${account.domain}`,
        name,
        accountId: account.id,
        agentAffinity: enthusiast ? 0.6 + rng() * 0.4 : rng() * 0.25,
        preferredDriver: pickDriver(rng),
      });
    }
  }
  return { accounts, users };
}

function pickDriver(rng: () => number): string {
  let r = rng() * DRIVERS.reduce((sum, d) => sum + d.share, 0);
  for (const d of DRIVERS) {
    r -= d.share;
    if (r <= 0) return d.id;
  }
  return DRIVERS[0]!.id;
}

const built = build();
export const ACCOUNTS = built.accounts;
export const USERS = built.users;

const accountById = new Map(ACCOUNTS.map((a) => [a.id, a]));
const userById = new Map(USERS.map((u) => [u.id, u]));

export function getAccount(id: string): AccountProfile | undefined {
  return accountById.get(id);
}

export function getUser(id: string): UserProfile | undefined {
  return userById.get(id);
}

/** Add a person first seen through the sensor, so sessions it reports can be shown alongside demo data. */
/** Upper bound on people and accounts added from sensor traffic, since the collector endpoint is public. */
const MAX_REGISTERED = 20_000;

export function registerUser(id: string, email: string | null, accountId: string): UserProfile | undefined {
  // The account is registered even for a known person: people can belong to several workspaces.
  if (!accountById.has(accountId) && accountById.size < MAX_REGISTERED) {
    const account: AccountProfile = { id: accountId, name: accountId, domain: email?.split("@")[1] ?? "", plan: "Starter", seats: 0, agentAffinity: 0 };
    ACCOUNTS.push(account);
    accountById.set(accountId, account);
  }
  const existing = userById.get(id);
  if (existing || userById.size >= MAX_REGISTERED) return existing;
  const user: UserProfile = {
    id,
    email: email ?? id,
    name: email?.split("@")[0] ?? id,
    accountId,
    agentAffinity: 0,
    preferredDriver: DRIVERS[0]!.id,
  };
  USERS.push(user);
  userById.set(id, user);
  return user;
}
