# @observe/next

Observe for Next.js (App Router, Next 14+). Three pieces:

- a **forwarding route** on your own domain that serves the sensor and passes its batches to the console,
- **`<Observe />`**, which loads the sensor and tells it which requests to protect,
- **`observe.check(action)`**, which asks the console, with your secret key, what to do with a protected request.

The page never decides. It attaches a short-lived signed token to protected requests; your server sends that token to the console and gets the decision back.

## Install

```sh
pnpm add @observe/next
```

### 1. The forwarding route

```ts
// app/%5Fobserve/[...path]/route.ts
export { GET, POST } from "@observe/next/route";
```

The folder is `%5Fobserve`, which Next.js serves at `/_observe`. A folder named `_observe` is a [private folder](https://nextjs.org/docs/app/getting-started/project-structure#private-folders) and is never routed.

### 2. The sensor, in the root layout

```tsx
// app/layout.tsx
import { Observe } from "@observe/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Observe protect={[{ path: "/api/invoices/export", method: "POST", action: "export_invoices" }]} />
      </body>
    </html>
  );
}
```

Props, all optional:

| Prop | Default | |
| --- | --- | --- |
| `siteKey` | `process.env.NEXT_PUBLIC_OBSERVE_KEY` | Publishable key `pk_...` |
| `protect` | none | `{ path, method?, action }[]`. Matching same-origin `fetch` / `XMLHttpRequest` calls get an `x-observe-token` header; matching `<form method="post">` submissions get a hidden `observe_token` field. `*` matches one path segment, a trailing `*` the rest. `method` defaults to `POST`; `*` matches any. |
| `path` | `/_observe` | Where the forwarding route is mounted |
| `debug` | `false` | Show the sensor's in-page debug panel |

Server actions post to the page they run on, so protect them by that page's path: `{ path: "/settings", method: "POST", action: "invite_teammate" }`.

On Next.js 15.3+ you can start the sensor from `instrumentation-client.ts` instead, before hydration. Use this or `<Observe />`, not both:

```ts
// instrumentation-client.ts
import { initObserve } from "@observe/next";

initObserve({ protect: [{ path: "/api/invoices/export", method: "POST", action: "export_invoices" }] });
```

### 3. The decision, on the server

```ts
// app/api/invoices/export/route.ts
import { observe } from "@observe/next/server";

export async function POST() {
  const d = await observe.check("export_invoices");
  if (d.wouldBlock) return new Response("Not allowed for this agent", { status: 403 });
  // ...
}
```

`observe.check(action, opts?)` reads `x-observe-token` from the incoming request through `headers()`. Options:

- `request`: read the token, method and path from this `Request` instead,
- `token`: pass the token yourself, e.g. a form's `observe_token` field: `observe.check("invite", { token: form.get("observe_token") as string | null })`,
- `method`, `path`: recorded with the decision (from `request` when given; `headers()` can't tell them),
- `secretKey`, `observeUrl`: override the environment.

It resolves to:

```ts
{
  mode: "observe",
  sessionId: "s_…",
  verdict: "agent",                 // "human" | "agent" | "unknown"
  tier: "recognised",               // "human" | "verified" | "recognised" | "unknown-automation" | "unknown"
  driver: { id: "claude-in-chrome", name: "Claude in Chrome", provider: "Anthropic" },
  confidence: 0.97,
  decidedBy: "exact-match",         // "signature" | "exact-match" | "jev" | "rules" | null
  outcome: "request_access",        // "admit" | "slow" | "request_access" | "ask" | "reroute" | "bill" | "refuse"
  wouldBlock: false,                // outcome === "refuse"
  policy: "default/export-needs-approval",
  token: "valid",                   // "valid" | "missing" | "invalid" | "expired" | "unchecked"
}
```

It never throws. With no secret key, a network error, a timeout (1.5 s) or any answer but `200`, it fails open:

```ts
{ mode: "observe", verdict: "unknown", tier: "unknown", driver: null, confidence: 0, decidedBy: null,
  outcome: "admit", wouldBlock: false, policy: null, token: "missing" | "unchecked", error: "decide answered 401" }
```

and logs one `console.warn` per process.

### Outside Next.js

`checkObserve` is the same check as a plain function. Import it from `@observe/next/check`, which has no Next.js imports and runs in any runtime with `fetch` (Node, Bun, Deno, edge workers):

```ts
import { checkObserve } from "@observe/next/check";

const d = await checkObserve("export_invoices", { request, secretKey: env.OBSERVE_SECRET_KEY });
```

The route handlers in `@observe/next/route` are also plain `(Request) => Promise<Response>` functions.

## Environment

| Variable | Where | |
| --- | --- | --- |
| `NEXT_PUBLIC_OBSERVE_KEY` | browser | Publishable key `pk_<site>_<16 hex>`. Public. |
| `OBSERVE_SECRET_KEY` | server | Secret key `sk_<site>_<32 hex>`, for `observe.check()`. Never expose it to the browser. |
| `OBSERVE_URL` | server | Console base URL. Default `https://observe-console-theta.vercel.app`. |

## What goes over the wire

| From | To | What |
| --- | --- | --- |
| Browser | `GET /_observe/s.js` (your domain) | Nothing but the request. |
| Your server | `GET {OBSERVE_URL}/sensor/v1/observe.min.js` | No headers from the visitor. Cached for 5 minutes (`next: { revalidate: 300 }`); the browser caches it for 5 minutes too. If the console can't be reached, the route serves `/* observe: unavailable */` uncached and the page carries on without the sensor. |
| Browser | `POST /_observe/v1/sdk/events` (your domain) | The sensor's batch (`text/plain` JSON, at most 256 KB), sent with `credentials: "omit"`. |
| Your server | `POST {OBSERVE_URL}/api/v1/sdk/events` | The batch unchanged, with only these request headers: `content-type`, `user-agent`, `x-vercel-ip-country`, `signature-agent`, `signature`, `signature-input`. 2 s timeout; on failure the browser gets `204` and carries on. The console's status and body (the session token) go back to the browser. |
| Browser | your protected endpoint | Your request plus `x-observe-token`. |
| Your server | `POST {OBSERVE_URL}/api/v1/decide` | `Authorization: Bearer $OBSERVE_SECRET_KEY` and `{ token, action, method, path }`. Nothing else from the visitor's request. |

## Security notes

- **First party.** The sensor and its traffic use your own origin, so a strict CSP (`script-src 'self'`, `connect-src 'self'`) needs no change and ad-blockers leave it alone.
- **No cookies reach Observe.** The forwarder copies an allowlist of six headers and drops everything else, including `Cookie`, `Authorization`, `X-Forwarded-For` and your own `x-observe-token`. The sensor also sends with `credentials: "omit"`.
- **The server decides.** The token is opaque, signed by the console and short-lived (30 minutes, refreshed by every batch). Only your server, holding the secret key, can turn it into a decision. Nothing the browser says about itself is trusted.
- **Fail open in observe mode.** Observe never blocks on its own. `outcome` is what your rules *would* do; `wouldBlock` is there for your code to act on. If the console is slow or down, `observe.check()` admits after 1.5 s and the forwarder answers `204`, so an outage on Observe's side never breaks your page or your endpoints.
- Keep `OBSERVE_SECRET_KEY` out of client code: it is only read in `@observe/next/server` and `@observe/next/check`.

## Example

`apps/example-shop` in this repo is a minimal app with all three pieces: an invoices table whose "Export CSV" button calls a protected route handler, and an "Invite teammate" form whose server action is protected. Each shows what Observe said.

```sh
cp apps/example-shop/.env.example apps/example-shop/.env.local
pnpm --filter @observe/example-shop dev   # http://localhost:3300, against the console on :3100
```
