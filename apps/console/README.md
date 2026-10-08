# Observe console

The web app where a SaaS company sees which AI agents act inside its product, for whom, and what they do. It pairs with `@observe/sensor` (`packages/sensor`), which runs in the customer's pages and reports how each session is driven.

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter @observe/console dev    # builds @observe/sensor, then serves http://localhost:3100
```

With no sensor connected, the console shows a week of demo traffic for a fictional finance SaaS (Ledgerline) so every page has something in it. To see real sessions next to it, run the sensor demo (`pnpm --filter @observe/sensor dev`) and initialise the sensor with `endpoint: "http://localhost:3100/api"`.

## Pages

| Page | What it answers |
| --- | --- |
| Overview `/` | How many sessions are human, agent or undecided; the trend; which agents; what they did; which accounts lean on them |
| Sessions `/sessions` | Every session, live, with search and filters by type, driver, account |
| Session `/sessions/:id` | Who drove when (event plot with the takeover marked), the passport and the evidence behind it, activity by page, and what the policy would have decided for each agent action |
| Agents `/agents`, `/agents/:id` | Each agent product: share, people, sensitive actions, 7-day trend, what it does, who uses it |
| Accounts `/accounts` | Person-hours against agent-hours on the same logins, per customer workspace |
| Entry log `/log` | Every agent action with the observe-mode decision and policy; CSV export |
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
- Both live in memory (`src/lib/store.ts`). A restart clears sensor sessions. The demo cache is versioned by `DATA_VERSION`; bump it when the generator changes.

Policy decisions (`src/lib/policy.ts`) follow the blueprint's default pack and are only computed and logged. Nothing is enforced.

## API

| Route | |
| --- | --- |
| `POST /api/v1/sdk/events` | Sensor batches, in the shape `packages/sensor/src/core/transport.ts` sends. CORS open, 256 KB limit |
| `GET /api/v1/sessions` | Recent sessions: `verdict`, `driver`, `account`, `q`, `range`, `limit` |
| `GET /api/v1/entries` | Entry log as JSON, or CSV with `format=csv`: `range`, `sensitive`, `driver`, `outcome`, `limit` |
| `GET /api/v1/sensor-sessions` | Sensor sessions with what decided each verdict, Jev's answer and the rules' verdict: `since` (ms epoch), `label`, `evidence=1` for the state Jev was given |

## How it uses the sensor package

- Verdict, tier, driver-kind and robustness types are imported from `@observe/sensor`.
- The driver catalogue (`src/lib/catalog.ts`) is built from the sensor's registry, so every agent the sensor can name has a name, provider and kind here. Demo traffic uses a subset with a traffic share.
- Behavioural reasons arrive as `[ruleId, weight]` pairs; labels and robustness come from the sensor's `RULES`.

## Not built yet

Persistence (Postgres for sessions and visas, ClickHouse for events per the blueprint), sign-in and multiple sites, visas and enforcement, webhooks, and SIEM export.
