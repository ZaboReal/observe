# Installing Observe on a site

How a site owner puts Observe in front of their product, and the contracts between the pieces. The design copies what bot-detection vendors do (Oct 8, 2026):

- **First party.** The sensor and its traffic go through the customer's own domain on a dedicated path, as Vercel BotID (`withBotId` rewrites), HUMAN ("first party" mode) and Fingerprint (proxy integrations) do. Ad-blockers leave it alone and a strict CSP (`script-src 'self'`, `connect-src 'self'`) needs no change.
- **No cookies reach us.** The sensor sends with `credentials: "omit"` and never uses `sendBeacon` (which always sends cookies). The forwarders strip `Cookie` and `Authorization` anyway, as Fingerprint's proxy does.
- **The server decides, with a signed token.** As Switchfrog (`/v1/verify`) and BotID (`checkBotId()`): the page attaches an opaque, signed, short-lived token to protected requests; the customer's server asks the console what to do with its secret key. The browser's own verdict is never trusted.
- **Versioned scripts with integrity hashes**, so a security team can pin an exact version, or take updates automatically through the forwarder.
- **A prompt for coding agents**, as Switchfrog ("set up with a coding agent") and Vercel (`llms.txt`, agent docs) offer: the setup page gives a prompt to paste into Claude or Cursor, and the console serves `/llms.txt`.

## Install paths

| Site | What the owner adds | Updates |
| --- | --- | --- |
| **Next.js** | `@observe/next`: a forwarding route (`app/%5Fobserve/[...path]/route.ts`, served at `/_observe`), `<Observe />` in the root layout, and `observe.check(action)` in protected route handlers and server actions | Automatic: the route serves the console's current sensor |
| **Static site or any other framework** | A pinned copy of the sensor (`/vendor/observe-sensor.<version>.min.js`), one config script, and a rewrite from `/_observe/*` to the console's `/api/*` (Vercel, Netlify, Cloudflare) | Re-run the installer, which updates the pinned file in a PR |
| **Server checks without Next.js** | `POST /api/v1/decide` with the secret key | n/a |

## Keys

- **Publishable key** `pk_<site>_<16 hex>`: in the page; says which site a batch belongs to. Public.
- **Secret key** `sk_<site>_<32 hex>`: on the customer's server only, for `/api/v1/decide`. Shown once when the site is created; the console stores a SHA-256 hash.

## Contracts

### Collector: `POST {endpoint}/v1/sdk/events`

Request: unchanged (the sensor's batch envelope, `text/plain` JSON, `key` = publishable key).

Response: `200` with `application/json`:

```json
{ "token": "v1.eyJzIjoic19hYmMiLCJrIjoiYXJ6YWNoIiwiZSI6MTc5MTUwMDAwMDAwMH0.Q2x...", "exp": 1791500000000 }
```

- `token` is `v1.<base64url(JSON payload)>.<base64url(HMAC-SHA256(secret, "v1." + payload part))>`, payload `{ "s": sessionId, "k": siteId, "e": expiryMs }`. Opaque to the sensor and the customer.
- Expires 30 minutes after issue; every batch refreshes it. Unknown key → `403`; bad body → `4xx` with no token.

### Sensor (browser)

- Keeps the latest token in memory. `sensor.token()` returns it (or `null`).
- `await sensor.protectAsync(actionId)`: closes typing runs, records the `protect` record, flushes now, and resolves to `{ actionId, sessionId, token }` (waits at most 1.5 s for a token; resolves with `token: null` on timeout).
- Config `protect: [{ path, method, action }]`: for `fetch` and `XMLHttpRequest` calls to a matching same-origin path (wildcards `*` per segment and a trailing `*`) and method, the sensor runs `protectAsync(action)` and adds the header **`x-observe-token`**. Form submissions (`<form method="post">` to a matching path) get a hidden input `observe_token`. Cross-origin requests are never touched.
- Batches never use `sendBeacon`; on `pagehide` it uses `fetch(..., { keepalive: true, credentials: "omit" })`.
- Script-tag config can also come from `data-protect` (JSON) on the tag.

### Decide: `POST /api/v1/decide` (console)

Request: `Authorization: Bearer sk_...`, JSON body:

```json
{ "token": "v1....", "action": "export_invoices", "method": "POST", "path": "/api/invoices/export" }
```

Response `200`:

```json
{
  "mode": "observe",
  "sessionId": "s_…",
  "verdict": "agent",
  "tier": "recognised",
  "driver": { "id": "claude-in-chrome", "name": "Claude in Chrome", "provider": "Anthropic" },
  "confidence": 0.97,
  "decidedBy": "exact-match",
  "outcome": "request_access",
  "wouldBlock": false,
  "policy": "default/export-needs-approval",
  "token": "valid"
}
```

- `token`: `"valid"`, `"missing"`, `"invalid"` (bad signature or another site's), or `"expired"`. Without a valid token the session is unknown: `verdict: "unknown"`, and the outcome is what the rules say for an unknown driver.
- `mode: "observe"`: nothing is enforced yet; `outcome` is what the rules would do and `wouldBlock` is `outcome === "refuse"`. The customer's code may act on it.
- The decision is recorded on the session as a server-confirmed action, so it shows in Activity.
- `401` for a missing or unknown secret key. Answer within ~300 ms; clients time out at 1.5 s and fail open.

### `@observe/next`

```ts
// app/%5Fobserve/[...path]/route.ts  (served at /_observe: a plain `_observe` folder is private in the App Router)
export { GET, POST } from "@observe/next/route";

// app/layout.tsx (in <head> or <body>)
import { Observe } from "@observe/next";
<Observe protect={[{ path: "/api/invoices/export", method: "POST", action: "export_invoices" }]} />

// a route handler (pass the request so decide knows the method and path) or a server action
import { observe } from "@observe/next/server";
const d = await observe.check("export_invoices", { request });
// Observe mode: log it. Acting on d.wouldBlock is the site owner's call, later.
```

Environment: `NEXT_PUBLIC_OBSERVE_KEY` (publishable), `OBSERVE_SECRET_KEY`, `OBSERVE_URL` (console base URL, default the hosted console).

- The route serves `GET /_observe/s.js` (the console's current sensor, cached 5 minutes) and forwards `POST /_observe/v1/sdk/events` to `{OBSERVE_URL}/api/v1/sdk/events` with only `content-type`, `user-agent`, `signature-agent`, `signature`, `signature-input` and the visitor's country (`x-vercel-ip-country`, sent on as `x-observe-country` because Vercel overwrites its own header on the way to the console). Never cookies or `authorization`.
- `observe.check` also takes `{ token }` (a form's `observe_token` field), `{ method, path }`, and `secretKey` / `observeUrl` for runtimes without `process.env`. `@observe/next/check` exports `checkObserve(request, action)` with no Next.js imports, for any server.
- `observe.check(action)` reads `x-observe-token` from the incoming request (`headers()` in Next, or a `Request` passed in), calls decide with a 1.5 s timeout, and on any failure returns `{ mode: "observe", verdict: "unknown", outcome: "admit", wouldBlock: false, error }` (fail open).

### Hosted sensor (console)

- `/sensor/<version>/observe.min.js`: immutable (`Cache-Control: public, max-age=31536000, immutable`).
- `/sensor/v1/observe.min.js`: the current version, `max-age=300`.
- `/sensor/manifest.json`: `{ "version", "url", "integrity": "sha384-…" }` for pinning with `<script integrity>`.
- All with `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`.
