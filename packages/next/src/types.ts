/** Public types for @observe/next. Kept here, with no imports, so every entry point can share them. */

/** Who the console thinks is driving the session. */
export type ObserveVerdict = "human" | "agent" | "unknown";

/** How much is known about the driver. `verified` only comes from signed requests, never from the page. */
export type ObserveTier = "human" | "verified" | "recognised" | "unknown-automation" | "unknown";

/** What the site's rules would do with this action. In observe mode nothing is enforced. */
export type ObserveOutcome = "admit" | "slow" | "request_access" | "ask" | "reroute" | "bill" | "refuse";

/** Which evidence settled the verdict. */
export type ObserveDecidedBy = "signature" | "exact-match" | "jev" | "rules";

/**
 * What the console made of the token the page sent.
 * `unchecked` is local: a token was sent but the console could not be asked (see `error`).
 */
export type ObserveTokenState = "valid" | "missing" | "invalid" | "expired" | "unchecked";

/** What an agent pays for an action under the site's agent pricing. */
export interface ObservePrice {
  /** In dollars, e.g. `0.25`. */
  amount: number;
  currency: "USD";
  /** Ready to show, e.g. `$0.25`. */
  display: string;
}

export interface ObserveDriver {
  /** Stable id, e.g. `claude-in-chrome`. */
  id: string;
  /** Product name, e.g. `Claude in Chrome`. */
  name: string;
  /** Who makes it, e.g. `Anthropic`. */
  provider: string;
}

/** The answer from `observe.check()` / `checkObserve()`, as `POST /api/v1/decide` returns it. */
export interface ObserveDecision {
  /** `observe`: nothing is enforced yet; `outcome` is what the rules would do. */
  mode: "observe";
  /** The sensor session the token belongs to. `null` without a valid token; absent when the check failed open. */
  sessionId?: string | null;
  verdict: ObserveVerdict;
  tier: ObserveTier;
  driver: ObserveDriver | null;
  /** 0..1 */
  confidence: number;
  decidedBy: ObserveDecidedBy | null;
  outcome: ObserveOutcome;
  /** `outcome === "refuse"`. Act on this to block. */
  wouldBlock: boolean;
  /**
   * Agent pricing: what this agent pays for the action when `outcome` is `bill`, otherwise `null`. People are never
   * charged. Collect it however suits the site (an API key, a 402 Payment Required, an invoice to the operator).
   */
  price?: ObservePrice | null;
  /** The rule that produced `outcome`, e.g. `default/export-needs-approval`. */
  policy: string | null;
  token: ObserveTokenState;
  /** Set only when the check failed open: why the console's answer is missing. */
  error?: string;
}

/** A request the sensor should attach a token to. */
export interface ObserveProtectRule {
  /** Same-origin path, without the query. A `*` segment matches one segment; a trailing `*` matches the rest. */
  path: string;
  /** HTTP method, case-insensitive. Default `POST`; `*` matches any method. */
  method?: string;
  /** Action id the server passes to `observe.check()`, e.g. `export_invoices`. */
  action: string;
}

/** Options for `<Observe />` and `initObserve()`. */
export interface ObserveOptions {
  /** Publishable key `pk_...`. Defaults to `process.env.NEXT_PUBLIC_OBSERVE_KEY`. */
  siteKey?: string;
  /** Requests to protect with a token. */
  protect?: ObserveProtectRule[];
  /** Where the forwarding route is mounted. Default `/_observe`. */
  path?: string;
  /** Show the sensor's in-page debug panel. */
  debug?: boolean;
}

/** Options for `observe.check()` / `checkObserve()`. */
export interface CheckOptions {
  /** The incoming request: the token is read from its `x-observe-token` header, and method and path from it. */
  request?: Request;
  /** The token itself, when it did not come in a header (e.g. a form's `observe_token` field). Wins over `request`. */
  token?: string | null;
  /** HTTP method of the protected request, recorded with the decision. Defaults to `request.method`. */
  method?: string;
  /** Path of the protected request, recorded with the decision. Defaults to the pathname of `request.url`. */
  path?: string;
  /** Secret key `sk_...`. Defaults to `process.env.OBSERVE_SECRET_KEY` (pass it where there is no `process.env`). */
  secretKey?: string;
  /** Console base URL. Defaults to `process.env.OBSERVE_URL`, then the hosted console. */
  observeUrl?: string;
}
