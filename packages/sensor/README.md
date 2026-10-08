# @observe/sensor

Browser sensor that tells whether an AI agent is driving a logged-in session, names the agent when it can, and hands your backend a passport at the moment of a sensitive action.

It watches **how** the page is driven (pointer paths, click timing, key timing, how text arrives, scroll mechanics, focus and visibility, injected overlays, automation globals) and never **what** is typed or shown. No key values, field values, text, screenshots, element ids or class names leave the page.

## Install

Script tag:

```html
<script src="observe-sensor.min.js" data-key="pk_live_..." data-endpoint="https://collector.example.com"></script>
```

Add `data-protect='[{"path":"/api/invoices/export","action":"export_invoices"}]'` to protect requests (see [Protected requests](#protected-requests)). However the sensor starts, from `data-*` attributes or `ObserveSensor.init(...)` in page code, it is `window.ObserveSensor.instance`.

Module:

```ts
import { init } from "@observe/sensor";

const sensor = init({ publishableKey: "pk_live_...", endpoint: "https://collector.example.com" });
sensor.identify({ userId: "usr_123", accountId: "acct_456" });
```

Without `endpoint` the sensor runs local-only and sends nothing.

## Use it at a sensitive action

```ts
exportButton.addEventListener("click", async () => {
  const { passport } = sensor.protect("export_csv");
  await fetch("/api/export", { method: "POST", body: JSON.stringify({ passport }) });
});
```

A passport looks like this:

```json
{
  "verdict": "agent",
  "tier": "recognised",
  "score": 9.4,
  "agentProbability": 0.999,
  "driver": { "id": "claude-in-chrome", "name": "Claude in Chrome", "provider": "Anthropic", "confidence": 0.91 },
  "reasons": [
    { "id": "typing.insert-no-keys", "label": "Text arrived with no key presses", "weight": 1.8, "detail": "9 chars in 9 events" },
    { "id": "pointer.teleport", "label": "Pointer jumped straight to the target", "weight": 1.6, "detail": "1 move, 349 px jump" }
  ],
  "handoffs": [],
  "source": "behaviour"
}
```

- `verdict`: `human`, `agent` or `unknown`. `unknown` means not enough evidence. Never treat it as `human`.
- `tier`: `human`, `recognised` (agent named from behaviour or page artifacts), `unknown-automation` (agent, product not named), `verified` (set from a signed source with `setPassport`), or `unknown`.
- `score`: summed log-odds over the recent window. Positive means agent; the thresholds are ±3.
- `handoffs`: moments the driver switched (person → agent or back), found by change-point detection.

The browser-side passport is advisory. The final decision belongs on your server, ideally combined with edge signature checks.

## Protected requests

The collector answers every batch with a short-lived token signed for this session (`200 {"token", "exp"}`, 30 minutes, refreshed by every batch). The page attaches it to a sensitive request and your server asks the console what to do; the browser's own verdict is never trusted.

Let the sensor do it for matching requests:

```ts
init({
  publishableKey: "pk_live_...",
  endpoint: "/_observe",
  protect: [
    { path: "/api/invoices/export", method: "POST", action: "export_invoices" },
    { path: "/api/teams/*/invite", action: "invite_user" },
  ],
});
```

A same-origin `fetch` or `XMLHttpRequest` whose path and method match first runs `protectAsync(action)` (at most 1.5 s), then goes out with:

```http
POST /api/invoices/export
x-observe-token: v1.eyJzIjoic19hYmMiLCJrIjoiYXJ6YWNoIiwiZSI6MTc5MTUwMDAwMDAwMH0.Q2x...
```

- Paths match without the query string. Segments compare exactly; `*` matches one segment; a trailing `*` matches the rest. `method` defaults to `POST`, is case-insensitive, and `*` matches any.
- Cross-origin requests are never touched. Request bodies are never read. Without a token the request goes out without the header; if anything in the sensor throws, the request goes out exactly as the page made it.
- `<form method="post">` submissions to a matching URL get a hidden `observe_token` input. A form submission can't wait, so it carries the token held at that moment (normally fresh, since every batch refreshes it); the `protect` record goes with a keepalive request. Synchronous XHR works the same way. `form.submit()` fires no submit event and is not covered; `requestSubmit()` and clicks are.
- `destroy()` restores `fetch` and `XMLHttpRequest`.

Or do it by hand:

```ts
const { token } = await sensor.protectAsync("export_invoices");
await fetch("/api/invoices/export", { method: "POST", headers: token ? { "x-observe-token": token } : {} });
```

On your server, check the token with the secret key (`@observe/next` does this as `observe.check(action)`):

```ts
const res = await fetch("https://<console>/api/v1/decide", {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.OBSERVE_SECRET_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ token: req.headers.get("x-observe-token"), action: "export_invoices", method: "POST", path: "/api/invoices/export" }),
  signal: AbortSignal.timeout(1500),
});
const d = await res.json(); // { verdict, tier, driver, outcome, wouldBlock, token: "valid" | "missing" | "invalid" | "expired", ... }
if (d.wouldBlock) return new Response("Not allowed for this agent", { status: 403 });
```

Fail open if decide errors or times out. A missing, invalid or expired token means the session is unknown (`verdict: "unknown"`), not human.

Batches never use `sendBeacon` (it always sends cookies): they go with `fetch(..., { credentials: "omit" })`, and on `pagehide` with `keepalive: true`, kept under the 64 KB keepalive limit.

## API

| Method | What it does |
| --- | --- |
| `init(config)` | Create or return the sensor for a key and endpoint, and start it |
| `sensor.identify({ userId, accountId })` | Attach your own opaque ids |
| `sensor.protect(actionId)` | Close open typing runs and return the current passport for a sensitive action |
| `sensor.protectAsync(actionId)` | `protect`, send the batch now, and resolve to `{ actionId, sessionId, passport, token }` once the collector's token is there (at most 1.5 s, then `token: null`; a token already held resolves at once) |
| `sensor.token()` | The collector's latest signed session token, or `null` when there is none or it has expired |
| `sensor.onPassport(fn)` | Subscribe to passport changes (called immediately with the current one) |
| `sensor.on(fn)` | Every event: passports, individual reasons, handoffs |
| `sensor.setPassport({ source: "signature", driver })` | Apply a verified passport from the edge (Web Bot Auth) or a handshake |
| `sensor.optIn()` / `sensor.optOut()` | Consent control; `waitForConsent: true` holds collection until `optIn()` |
| `sensor.reset()` | New session (logout or account switch) |
| `sensor.exportSession()` | Everything held locally, as JSON (for lab collection) |
| `sensor.destroy()` | Remove all listeners and UI |

## Config

| Option | Default | Notes |
| --- | --- | --- |
| `publishableKey` | — | Sent in the batch body (`key`), so batches stay simple CORS requests with no preflight |
| `endpoint` | — | Collector base URL; batches go to `POST {endpoint}/v1/sdk/events` |
| `capture` | `"standard"` | `"lab"` also streams raw pointer/key timings (no values) for the benchmark lab |
| `waitForConsent` | `false` | Hold collection until `optIn()` |
| `debug` | `false` | In-page debug panel. Also `?observe_debug=1` |
| `labDriver` | — | Ground-truth label for lab runs. Also `?observe_driver=claude-in-chrome` |
| `probes.debugger` | `false` | Detect a DevTools-protocol client with Runtime enabled. Also fires for developers with DevTools open |
| `probes.console` | `true` | Wrap `console.log/info/debug` to catch automation markers. Log call sites then point at the sensor; add it to DevTools' ignore list or turn this off |
| `ignoreSyntheticFrom` | — | CSS selector for elements whose synthetic events come from your own code |
| `windowActions` | `12` | Actions in the rolling evaluation window |
| `protect` | — | `[{ path, method?, action }]`: same-origin `fetch`, XHR and form posts to wait for a token and carry `x-observe-token` (forms: `observe_token`). Script tag: `data-protect` (JSON). See [Protected requests](#protected-requests) |

## How detection works

1. **Capture**: capture-phase, passive listeners turn raw events into per-action records: clicks (approach path, hover, press, centre offset), typing runs (key gaps, holds, rollover, inserts with no keys, pastes, script fills), scroll bursts (wheel deltas, scrolls with no input), and dropdown changes with no interaction.
2. **Probes**:
   - automation globals, `navigator.webdriver`, agent user-agent tokens and the `HeadlessChrome` brand;
   - DevTools-protocol bindings on `window` (found by their shape and error), and the DevTools command-line API leaking into the page;
   - agent overlays, injected styles, keyframes and tagged elements via a MutationObserver, plus random-id artifacts (Patchright's init script, nodriver's click marker);
   - known agent extension ids in `chrome-extension://` URLs and in WXT start-up `postMessage` announcements;
   - fixed strings automation code logs to the page console (`browser-use highlight elements`, `[v3-piercer]`, `[WDIO]` …);
   - stealth leftovers: a patched `webdriver` getter or `permissions.query`, replaced `Object.keys`, an invented `navigator.headless`, pinned window geometry, the 2020 plugin list;
   - client hints that disagree with the user agent (Chromium's seeded brand order is reproduced exactly);
   - two same-origin tabs reporting focus at once (focus emulation), WebMCP tool activations and `SubmitEvent.agentInvoked`;
   - screen sizes typical of agent VMs, a software WebGL renderer, planted-CSS presence checks, and (opt-in) a DevTools-protocol client with Runtime enabled.
3. **Analyze**: each record becomes weighted evidence (`src/detect/rules.ts`). Input mechanics are matched against each driver's profile in the registry to name the product.
4. **Score**: evidence is summed as log-odds over a rolling window, with a per-rule cap. Decisive evidence (webdriver, framework globals, an active agent overlay, a WebMCP tool call) floors the score at +8. A CUSUM change-point detector finds handoffs.

The weights are hand-set starting points from public teardowns and papers. Fit them in the benchmark lab before blocking anything on them.

## Driver registry

`src/registry/drivers.ts` covers 70 agents: Claude in Chrome, the ChatGPT/Codex extension and desktop browser, Gemini in Chrome, Brave Leo, Comet, Manus, Monica, OpenClaw, Genspark, Nanobrowser, BrowserOS, Taxy, HARPA, Sider, Skyvern, Midscene, the MCP browser bridges, Playwright, Puppeteer, Selenium, Patchright, nodriver, browser-use, Stagehand, Steel, Nova Act, Fara, Eko and more. Server-side user agents, IP-range lists and Web Bot Auth key directories for 43 operators live in [data/server-agents.json](../../data/server-agents.json) for the server module. Each entry separates:

- **Acting** markers (overlays, injected globals, postMessage announcements, agent user-agent tokens): an agent is driving now.
- **Residue**: styles left behind after an agent stopped.
- **Installed** markers (always-on sidebar roots, globals, planted-CSS probes, browser brands): the product is present. These only name a driver once behaviour says an agent is driving, so a person who merely has HARPA or Monica installed is never flagged.
- **Input mechanics**: hover, press, key-gap and hold ranges, how text and scrolling arrive.

Every entry has sources and a confidence level. The human-readable catalogue is [docs/agent-registry.md](../../docs/agent-registry.md), generated with `node scripts/registry-doc.mjs` after a build. Browser bundles drop the notes and sources at build time; the npm module keeps them.

Products change these between releases, so keep the registry current and treat page artifacts as naming evidence, not the basis of the verdict.

## Develop

```bash
pnpm install
pnpm --filter @observe/sensor test
pnpm --filter @observe/sensor build
pnpm --filter @observe/sensor dev    # http://localhost:5317/examples/demo.html
```

The demo page is a small invoices app with five agent tasks. Open it with `?observe_driver=<label>` and drive it yourself or with an agent. The debug panel shows the verdict live, and its **copy** button exports the session JSON.
