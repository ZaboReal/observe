/**
 * Install instructions for a site, in one place, so the setup page, the add-a-site page and /llms.txt never drift
 * apart. The design is in docs/install.md.
 */

export interface InstallTarget {
  /** The console's own origin, e.g. https://observe-console-theta.vercel.app */
  console: string;
  publishableKey: string;
  host: string;
  /** The hosted sensor's current version and integrity hash (public/sensor/manifest.json). */
  sensor: { version: string; integrity: string } | null;
}

const PROTECT_EXAMPLE = `[{ "path": "/api/invoices/export", "method": "POST", "action": "export_invoices" }]`;

/** A prompt to paste into Claude Code, Cursor or another coding agent working in the site's repo. */
export function agentPrompt(t: InstallTarget): string {
  return `Install Observe in this codebase. Observe tells people from AI agents (Claude in Chrome, Comet, ChatGPT agent and about 70 others) in every session, and lets our server ask who is driving before a sensitive action.

Follow the instructions at ${t.console}/llms.txt exactly. Values for this site (${t.host}):
- Console URL: ${t.console}
- Publishable key (public, fine to commit): ${t.publishableKey}
- Secret key: I will set OBSERVE_SECRET_KEY in the server environment myself. Never commit it, log it or put it in client code.

Find the sensitive actions in this app: exporting or downloading data, deleting, inviting or sharing, payments and refunds, changes to settings, roles or API keys, and sign-ups. Protect each one as the instructions describe, in observe mode (log only, never block). Open a pull request that lists every action you protected, the route and method for each, and anything you were unsure about.`;
}

export function nextSteps(t: InstallTarget) {
  return {
    install: `npm install ${t.console}/packages/observe-next.tgz`,
    env: `# .env.local (and your host's environment settings)
NEXT_PUBLIC_OBSERVE_KEY=${t.publishableKey}
OBSERVE_URL=${t.console}
OBSERVE_SECRET_KEY=sk_...   # server only: never commit it`,
    route: `// app/%5Fobserve/[...path]/route.ts  (served at /_observe; a plain _observe folder is private in Next)
// Serves the sensor and forwards its batches through your own domain, without cookies.
export { GET, POST } from "@observe/next/route";`,
    layout: `// app/layout.tsx, inside <body>
import { Observe } from "@observe/next";

<Observe protect={${PROTECT_EXAMPLE}} />`,
    check: `// app/api/invoices/export/route.ts
import { observe } from "@observe/next/server";

export async function POST(request: Request) {
  const d = await observe.check("export_invoices", { request });
  // Observe mode: log it, decide later. d.verdict, d.driver?.name, d.outcome, d.wouldBlock
  ...
}
// In a server action: observe.check("invite_member", { method: "POST", path: "/team" })`,
  };
}

export function otherSteps(t: InstallTarget) {
  const v = t.sensor?.version ?? "<version>";
  const file = `/vendor/observe-sensor.${v}.min.js`;
  return {
    download: `# A pinned copy you serve yourself, checked against the published hash.
curl -o public${file} ${t.console}/sensor/${v}/observe.min.js
curl -s ${t.console}/sensor/manifest.json   # integrity: ${t.sensor?.integrity ?? "sha384-…"}`,
    tag: `<script
  src="${file}"
  integrity="${t.sensor?.integrity ?? "sha384-…"}"
  data-key="${t.publishableKey}"
  data-endpoint="/_observe"
  data-protect='${PROTECT_EXAMPLE}'
  defer
></script>`,
    vercel: `// vercel.json: batches go through your own domain, so a strict CSP needs no change
{ "rewrites": [{ "source": "/_observe/:path*", "destination": "${t.console}/api/:path*" }] }`,
    netlify: `# public/_redirects (Netlify)
/_observe/*  ${t.console}/api/:splat  200`,
    nginx: `# nginx: forward without cookies or auth headers
location /_observe/ {
  proxy_pass ${t.console}/api/;
  proxy_set_header Cookie "";
  proxy_set_header Authorization "";
}`,
    check: `# Your server, before a protected action: pass the token the page attached.
curl -X POST ${t.console}/api/v1/decide \\
  -H "Authorization: Bearer $OBSERVE_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"token":"<x-observe-token header or observe_token form field>","action":"export_invoices","method":"POST","path":"/api/invoices/export"}'`,
  };
}

/** /llms.txt: the instructions a coding agent follows. */
export function llmsTxt(c: Omit<InstallTarget, "publishableKey" | "host">): string {
  const t = { ...c, publishableKey: "pk_...", host: "your site" };
  const n = nextSteps(t);
  const o = otherSteps(t);
  return `# Observe: install instructions for coding agents

Observe tells people from AI agents in every session of a web product, names the agent, and lets the product's server ask who is driving before a sensitive action. Console: ${c.console}

## Rules

- Everything goes through the site's own domain on the path /_observe, so a strict Content-Security-Policy needs no change. Never load the sensor from another domain.
- Never send cookies or Authorization headers to Observe. The sensor and the forwarders below already don't.
- The secret key (sk_...) is server-only: environment variable OBSERVE_SECRET_KEY. Never commit it, log it, or expose it to the browser. The publishable key (pk_...) is public.
- Observe mode: protected actions call the check and log the answer. Do not block or change behaviour unless the user asks.
- The check fails open: if Observe is unreachable or slow (1.5 s), the action proceeds.
- Open a pull request; list every protected action (route, method, action id) and anything you were unsure about.

## Choosing actions to protect

Protect requests that export or download data, delete, invite or share, pay or refund, change settings, roles or API keys, and sign up. Use short action ids in snake_case that say what happens (export_invoices, invite_member, delete_project). Each protected request needs both halves: the page attaches a token (the protect list) and the server checks it.

## Next.js (App Router)

1. Install: \`${n.install}\`
2. Environment:
\`\`\`
${n.env}
\`\`\`
3. Forwarding route:
\`\`\`ts
${n.route}
\`\`\`
4. Sensor and protect list, once, in the root layout:
\`\`\`tsx
${n.layout}
\`\`\`
5. In each protected route handler or server action:
\`\`\`ts
${n.check}
\`\`\`

## Any other site (static, Rails, Django, Express, ...)

1. Serve a pinned copy of the sensor (current version ${c.sensor?.version ?? "see manifest"}):
\`\`\`
${o.download}
\`\`\`
2. Add to every page's <head>:
\`\`\`html
${o.tag}
\`\`\`
3. Forward /_observe/* to the console, without cookies. Vercel:
\`\`\`
${o.vercel}
\`\`\`
Netlify:
\`\`\`
${o.netlify}
\`\`\`
nginx:
\`\`\`
${o.nginx}
\`\`\`
4. On the server, before each protected action, read the x-observe-token header (or the observe_token form field) and ask:
\`\`\`
${o.check}
\`\`\`
The answer: { mode, verdict (human | agent | unknown), driver { id, name, provider }, confidence, outcome, wouldBlock, price ({ amount, currency, display } when outcome is bill: the site charges agents for this action; else null), policy, token (valid | missing | invalid | expired) }. Use a 1.5 s timeout and proceed if it fails.

## Check it works

Open the site with ?observe_debug=1: a panel shows what the sensor sees, and the session appears in the console within seconds.
`;
}
