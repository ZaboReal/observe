# Pilot: Observe in front of arzach.ai

Oct 8, 2026 · first real site for the sensor and console

## What runs where

```
visitor's browser on arzach.ai
  └─ /vendor/observe-sensor.min.js + /observe.js     (cwctw repo, site/)
       └─ POST arzach.ai/_observe/v1/sdk/events      (same origin: arzach's CSP stays 'self')
            └─ vercel.json rewrite → observe-console-theta.vercel.app/api/v1/sdk/events
                 ├─ Supabase project "observe": raw batches + Jev's answers
                 └─ Jev (TypeSafe): who is driving each session
console: https://observe-console-theta.vercel.app   (password)
```

| Piece | Where | Owner |
| --- | --- | --- |
| Sensor script, `observe.js`, the `/_observe` rewrite | `ibrahim7860/cwctw`, `site/` (PR `observe-pilot`) | arzach's Vercel project (Ibby) |
| Console (dashboard + collector) | this repo, `apps/console`; Vercel project `observe-console` | your Vercel account |
| Database | Supabase project `observe` (us-east-1, free plan) | your Supabase account |

Nothing on arzach.ai is blocked or changed for visitors: the console runs in observe mode and only records what its rules would have done.

## What it records

- **Every visit:** who is driving (person, a named agent, unknown automation, or undecided), how it was decided (an exact marker on the page, Jev, or the sensor's own rules), pages viewed, clicks, typing and scrolling as timing only.
- **Two tracked actions:** `sign_up` (the early-access form) and `download_paper` (any PDF link). They appear in Activity with what the rules would have done.
- **From the request:** user agent, country (Vercel's `x-vercel-ip-country`), and a `Signature-Agent` header if an agent sends one (ChatGPT agent signs its requests this way).
- **Never:** what anyone types, field values, page text, screenshots, IP addresses.

Raw batches are deleted after 30 days.

## Running it

Console settings live in Vercel (`observe-console` → Settings → Environment Variables):

| Variable | |
| --- | --- |
| `OBSERVE_SITE_NAME`, `OBSERVE_SITE_HOST`, `OBSERVE_SITE_KEY` | Arzach, arzach.ai, the publishable key in `observe.js` |
| `OBSERVE_DEMO=0`, `OBSERVE_SITE_ANONYMOUS=1` | No demo traffic; visitors aren't signed in |
| `SUPABASE_URL`, `SUPABASE_KEY` | The `observe` project and its publishable key |
| `OBSERVE_DB_TOKEN` | Secret that the database functions check (only its SHA-256 is stored, in `observe.tokens`) |
| `OBSERVE_CONSOLE_PASSWORD` | The console's password |
| `TYPESAFE_API_KEY` | Jev |

The password and database token are also in `apps/console/.env.pilot.local` (git-ignored) on the machine that set this up.

Deploy the console from the repo root with `vercel deploy --prod` (the project's root directory is `apps/console`; `.vercelignore` keeps the upload small). The database schema is `apps/console/supabase/migrations/`.

## Checking it works

1. Open arzach.ai with `?observe_debug=1` and click around: the sensor's panel shows its verdict.
2. The session shows up in the console within a few seconds, under Sessions.
3. Add `?observe_driver=<label>` to label a test run (for example `human`, or the agent you are driving it with).

## Turning it off

Revert the PR in cwctw (or delete the two `<script>` tags). The console and database can stay; they only receive what the site sends.

## Open questions for the pilot

- **Privacy note on arzach.ai.** The sensor collects behavioural telemetry, which is personal data under GDPR. Arzach should mention it in a privacy notice before the pilot is publicised.
- **Enforcement.** Once there is real traffic, decide whether sign-ups by unknown automation should be asked to confirm or blocked. That needs the form to check with the console before submitting.
- **Server-side agents.** Fetchers that don't run JavaScript (GPTBot, ChatGPT-User, ClaudeBot, Perplexity-User) never load the sensor. Seeing them needs a small edge middleware on arzach's Vercel project that reports each request's user agent; `data/server-agents.json` has the identifiers.
