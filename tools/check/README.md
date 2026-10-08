# @observe/check

A quick sanity check on who-is-driving decisions. It drives automation frameworks through the sensor demo page with the sensor reporting to the console, then reports what decided each session (an exact match, Jev, or the sensor's rules) and whether it was right.

It is not a benchmark: one page, a few tasks, scripted runs. Sessions from real people are what show how often a person would be wrongly flagged, so do those too (below).

## Before you start

1. Put the Jev key in `apps/console/.env.local` (git-ignored):

   ```bash
   TYPESAFE_API_KEY=apikey_...
   ```

2. Start the console and the demo page, each in its own terminal:

   ```bash
   pnpm dev:console     # http://localhost:3100
   pnpm dev:sensor      # http://localhost:5317/examples/demo.html
   ```

## Scripted runs

```bash
pnpm check                                              # Playwright, Puppeteer, Selenium × default, stealth, human, careful
pnpm check --frameworks playwright --variants human --repeat 3
pnpm check --headed                                     # watch the browsers work
```

| Variant | What it is | What should decide |
| --- | --- | --- |
| `default` | The framework as shipped: `navigator.webdriver` set, headless | Exact match |
| `stealth` | Automation flags hidden: no `--enable-automation`, `AutomationControlled` off, a normal user agent | Jev, from behaviour |
| `human` | Stealth plus curved pointer paths, 80–260 ms hovers, 60–140 ms presses, per-key typing and wheel scrolling (Playwright and Puppeteer) | Jev, from behaviour |
| `careful` | `human`, with pointer positions rounded to whole pixels as a real mouse reports them: the hardest case here | Jev, from behaviour |

The report prints to the terminal and is saved to `tools/check/results/latest.md` (git-ignored, with the raw run list).

## Manual runs: consumer agents and people

The scripted frameworks cannot stand in for Claude in Chrome, Comet or a person. For those, open the demo with a label and do the five tasks listed on the page:

```
http://localhost:5317/examples/demo.html?observe_driver=LABEL&observe_endpoint=http://localhost:3100/api
```

| Who drives | `LABEL` |
| --- | --- |
| You, or anyone else, by hand | `human` |
| Claude in Chrome | `claude-in-chrome` |
| Perplexity Comet | `comet` |
| ChatGPT extension / Codex | `chatgpt-extension` |
| Gemini in Chrome | `gemini-in-chrome` |
| Edge Copilot Mode | `edge-copilot` |

For an agent, open the page, then give it the instruction: *"Do the five test tasks listed on this page."* Use a fresh tab for each run so each is its own session. Note the agent's version in your own records.

For people, include a few who use a screen reader, voice dictation or password-manager autofill: those are the people most likely to be mistaken for an agent.

Then report every labelled session from the last hour (or `--since 120m`):

```bash
pnpm check:report
```

## Reading the report

- **Final** is what the console shows. **Decided by** says whether an exact match on the page (such as `navigator.webdriver` or an agent overlay), Jev, or the sensor's own rules settled it.
- **Jev: agent?** is Jev's probability that an agent is driving, even when an exact match decided. The console calls an agent at 85% or more and a person at 15% or less; in between stays undecided.
- **Jev's pick** is the product Jev chose from the sensor's 70-agent registry, or `human` / `unknown_automation`.
- **Sensor rules** is what the hand-weighted rules in the browser said, for comparison.

Every session also shows this on its page in the console (`/sessions/<id>`, under *How it was decided*), and `GET /api/v1/sensor-sessions?evidence=1` returns the exact state Jev was given.
