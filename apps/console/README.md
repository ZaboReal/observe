# Observe console

The web app where a SaaS company sees which AI agents act inside its product, for whom, and what they do. It pairs with `@observe/sensor` (`packages/sensor`), which runs in the customer's pages and reports how each session is driven.

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter @observe/console dev    # builds @observe/sensor, then serves http://localhost:3100
```

With no sensor connected, the console shows a week of demo traffic for a fictional finance SaaS (Ledgerline) so every page has something in it. To see real sessions next to it, run the sensor demo (`pnpm --filter @observe/sensor dev`) and initialise the sensor with `endpoint: "http://localhost:3100/api"`.

The look follows the product site (`apps/site`): its colours, type, panels and pills, and the Overview is the site's hero dashboard made real.

## Sites

The console watches one or more sites, each with its own sessions and keys; the menu at the top of the sidebar switches between them (a cookie remembers the choice) and adds new ones. The sensor's publishable key says which site a batch belongs to; a site's secret key (stored only as a SHA-256 hash) lets its server call `/api/v1/decide` (`src/lib/site.ts`).

- **Sites in the database**, added with *Add a site* (`/sites/new`), which shows the secret key once and a prompt for the owner's coding agent. The arzach.ai pilot is the first: see [docs/arzach-pilot.md](../../docs/arzach-pilot.md).
- **Ledgerline**, the demo, with generated traffic. On unless `OBSERVE_DEMO=0`. In development, batches with no key or an unknown one also go here.
- **In development without a database**, one site from the environment: `OBSERVE_SITE_KEY`, `OBSERVE_SITE_ID`, `OBSERVE_SITE_NAME`, `OBSERVE_SITE_HOST`, `OBSERVE_SITE_ENV`, `OBSERVE_SITE_ANONYMOUS=1`.

How a site installs Observe, and the contracts between sensor, console and `@observe/next`, are in [docs/install.md](../../docs/install.md). Setup shows each site's install steps; `/llms.txt` gives coding agents the same instructions.

## Pages

| Page | What it answers |
| --- | --- |
| Overview `/` | Sessions now, the share driven by agents, agents seen, what the rules would block; people and agents over time; top agents; live agent activity |
| Sessions `/sessions` | Every session, live, with search and filters by type, driver, account |
| Session `/sessions/:id` | Who is driving and how sure we are, who drove when (the takeover marked), how it was decided and the evidence behind it, activity by page, and what the rules would do with each agent action |
| Agents `/agents`, `/agents/:id` | Each agent product: share, people, sensitive actions, 7-day trend, what it does, who uses it |
| Accounts `/accounts` | Person-hours against agent-hours on the same logins, per customer workspace |
| Activity `/activity` | Every agent action with what the rules would do; CSV export (`/log` redirects here) |
| Rules `/rules` | The default rules, per agent and kind of action (read-only, observe mode) |
| Setup `/setup` | Install snippets, keys and whether the sensor is reporting |

Every page re-renders from the server every 4 seconds; the Live/Paused toggle stops it. Time ranges are 1h, 24h and 7d.

## Who is driving: Jev

For sessions the sensor reports, the console asks [TypeSafe's Jev](https://www.llmreference.com/provider/typesafe-ai/jev) who is driving, instead of trusting the sensor's hand-weighted rules. Put the key in `apps/console/.env.local` (git-ignored):

```bash
TYPESAFE_API_KEY=apikey_...
# optional: TYPESAFE_BASE_URL=https://api.typesafe.ai   JEV_MODEL=jev-1.13.0
```

- **What Jev reads** (`src/lib/evidence.ts`): the session's input mechanics (hover and press times, pointer paths, key gaps, how text and scrolling arrived), what the sensor saw on the page, plain-language observations and the latest actions. No rule weights and nothing the person typed or saw; page signals name only markers the agents themselves inject. This evidence is sent to TypeSafe's API, so TypeSafe is a data processor for it.
- **What Jev is asked** (`src/lib/jev-questions.ts`): a yes/no ("an agent is operating this session") and a choice over a person, unknown automation and every agent in the sensor's registry, each option described by its characteristics. About 7,000 input tokens, 0.2–0.5 s.
- **When** (`src/lib/classify.ts`): after a batch is ingested, off the request path, only when new evidence arrived and at most every 3 seconds per session.
- **How the verdict is settled** (`src/lib/passport.ts`), strongest first: a signed passport; an exact match on the page (`navigator.webdriver`, a framework global, an agent overlay), with Jev naming the agent when the match does not; Jev (agent at 85% or more, person at 15% or less, otherwise undecided); the sensor's rules while Jev has not answered or is unavailable.

Each session page shows what decided it under *How it was decided*: Jev's probability and top picks, and what the rules said. `tools/check` drives Playwright, Puppeteer and Selenium through the sensor demo and reports the results; see its README.

## Data

- **Demo traffic** comes from `src/lib/generate.ts`. Sessions are generated per minute from a seed derived from that minute, so the history is stable across reloads and "now" reveals new sessions as the clock moves. Rates follow a working day, agents keep going overnight, and some sessions start with a person and get taken over by an agent.
- **Sensor sessions** arrive at `POST /api/v1/sdk/events` (see `src/lib/ingest.ts`) and show next to the demo data, marked `sensor`. Point the sensor at the console with `endpoint: "http://localhost:3100/api"`; the sensor appends `/v1/sdk/events`.
- Both live in memory (`src/lib/store.ts`). Without a database a restart clears sensor sessions. The store is versioned by `DATA_VERSION`; bump it when the generator or the store changes.
- **With a database** (a deployed console: `SUPABASE_URL`, `SUPABASE_KEY`, `OBSERVE_DB_TOKEN`), the real site's raw batches are stored in Supabase as they arrive and replayed into memory through the same ingest code before each page reads (`src/lib/db.ts`, `src/lib/sync.ts`); Jev's answers are stored too, so every server instance shows the same verdict and Jev is asked once. The tables sit in a schema the API does not expose, behind functions that check the token (`supabase/migrations/`). Raw batches are kept 30 days. `OBSERVE_DB_READONLY=1` lets a development console show the pilot's data without writing to it. `test/db-sync.test.ts` runs against a real database when given a test token.

Policy decisions (`src/lib/policy.ts`) follow the blueprint's default pack and are only computed and logged. Nothing is enforced.

## API

| Route | |
| --- | --- |
| `POST /api/v1/sdk/events` | Sensor batches, in the shape `packages/sensor/src/core/transport.ts` sends. CORS open, 256 KB limit, 120 batches a minute per session; a deployed console takes only its sites' keys. Replies with a signed session token (`src/lib/token.ts`) |
| `POST /api/v1/decide` | A site's server asks what to do with a protected action: `Authorization: Bearer sk_…`, body `{ token, action, method, path }`. Answers who is driving and what the rules would do (observe mode), and records the action on the session |
| `GET /sensor/<version>/observe.min.js`, `/sensor/v1/observe.min.js`, `/sensor/manifest.json` | The hosted sensor: versioned and immutable, the current version, and its integrity hash (`scripts/copy-public.mjs`) |
| `GET /llms.txt` | Install instructions for coding agents |
| `GET /api/v1/sessions` | Recent sessions: `verdict`, `driver`, `account`, `q`, `range`, `limit` |
| `GET /api/v1/entries` | Agent activity as JSON, or CSV with `format=csv`: `range`, `sensitive`, `driver`, `outcome`, `limit` |
| `GET /api/v1/sensor-sessions` | Sensor sessions with what decided each verdict, Jev's answer and the rules' verdict: `since` (ms epoch), `label`, `evidence=1` for the state Jev was given |

## How it uses the sensor package

- Verdict, tier, driver-kind and robustness types are imported from `@observe/sensor`.
- The driver catalogue (`src/lib/catalog.ts`) is built from the sensor's registry, so every agent the sensor can name has a name, provider and kind here. Demo traffic uses a subset with a traffic share.
- Behavioural reasons arrive as `[ruleId, weight]` pairs; labels and robustness come from the sensor's `RULES`.

The read APIs answer for the site chosen in the console. With `OBSERVE_CONSOLE_PASSWORD` set, every page and read API needs the password (`src/proxy.ts`, `src/lib/auth.ts`); the collector, decide (secret key), the hosted sensor and `/llms.txt` stay open. Session tokens are signed with `OBSERVE_TOKEN_SECRET`.

## Deploy

Vercel project `observe-console` (root directory `apps/console`), from the repo root: `vercel deploy --prod`. `.vercelignore` keeps the upload to what the build needs. Settings are listed in [docs/arzach-pilot.md](../../docs/arzach-pilot.md).

## Not built yet

Per-person sign-in, more than one real site per deployment, access approvals and enforcement, webhooks, and SIEM export.
