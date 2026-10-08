# Jev check: first results

Oct 7, 2026 · scripted runs on the sensor demo page · Jev model `jev-1.13.0`

## What was tested

The console now asks Jev who is driving each sensor session. Jev reads the session's input mechanics (click, typing and scroll timing, pointer paths), what the sensor saw on the page, and a description of each of the 70 agents in our registry. It answers with a probability that an agent is driving and which product it is. An exact match on the page, such as `navigator.webdriver` or an agent's overlay, settles the verdict without judgement; Jev decides everything else.

To check it, `tools/check` drove Playwright, Puppeteer and Selenium through the demo page's five tasks (search, filter, export, invite, change a setting) in four styles, twice each:

| Style | What it does |
| --- | --- |
| Default | The framework as shipped |
| Stealth | Automation flags hidden and a normal user agent |
| Human-like | Stealth plus curved mouse paths, 80–260 ms hovers, 60–140 ms presses, key-by-key typing, wheel scrolling |
| Careful | Human-like, with pointer positions rounded to whole pixels as a real mouse reports them |

## Results (20 sessions)

| Framework | Default | Stealth | Human-like | Careful |
| --- | --- | --- | --- | --- |
| Playwright | Agent, named (exact match) | Agent, unnamed (Jev 98%) | Agent, unnamed (Jev 96%) | **Undecided** (Jev 28–35%) |
| Puppeteer | Agent, named (exact match) | Agent, named (exact match) | Agent, named (exact match) | Agent, named (exact match) |
| Selenium | Agent, named (exact match) | Agent, named (exact match) | n/a | n/a |

- **18 of 20 sessions got the right verdict.** The two misses were both careful Playwright runs, and they stayed *undecided* rather than being called a person.
- **Jev on its own** was right in 18 of 20. It named the right framework in 14 of 20; the other 6 it called "agent, product unknown" (Playwright with automation hidden) or got wrong (the 2 careful runs).
- **Speed and cost:** 0.2–0.5 s and about 7,000 input tokens per answer, a fraction of a cent.

## What we learned

1. **Telling Jev what real hardware cannot do mattered.** In the first run, the human-like Playwright script fooled Jev (21% agent): its timing looked human. But every mouse press landed on a fractional pixel position at 1× zoom, which no real mouse or trackpad produces. Once the evidence spelled that out in plain words, Jev called the same script an agent at 96%.
2. **Frameworks leave exact traces.** Puppeteer injects its own globals into the page even in stealth mode, and Selenium leaves ChromeDriver's. No judgement needed.
3. **A careful enough script beats behaviour alone.** With whole-pixel positions and human-like timing, nine actions on one page left nothing physically impossible. Jev and the old hand-weighted rules were both fooled. This is the limit of watching behaviour: it raises the cost of hiding but does not make it impossible. It is why the product leans on signatures and on asking the person (passkey) for sensitive actions, and why "undecided" must never be treated as "a person".

## Marker check: classic frameworks

The registry lists markers for 48 agents, mostly read from each product's code; only a handful had been seen live. The second run tested every classic framework we can run here, as shipped, three times each (24 sessions).

| Framework | Caught | Named | Own marker seen | What named it |
| --- | --- | --- | --- | --- |
| Selenium | 3/3 | 3/3 | 3/3 | ChromeDriver's `cdc_` globals |
| Puppeteer | 3/3 | 3/3 | 3/3 | Puppeteer's injected globals |
| nodriver | 3/3 | 3/3 | 3/3 | Its click marker and keyframes |
| Cypress | 3/3 | 3/3 | 3/3 | `window.Cypress` |
| Playwright | 3/3 | 3/3 | 0/3 | Jev, from click and typing mechanics (Playwright 1.53+ injects no globals) |
| WebdriverIO | 3/3 | 0/3 | 0/3 | Called Puppeteer |
| Vercel agent-browser | 3/3 | 0/3 | 0/3 | Called Puppeteer |
| Chrome DevTools MCP | 3/3 | 0/3 | 0/3 | Called Puppeteer (it is built on Puppeteer) |

- **Every session was caught,** by `navigator.webdriver` or the HeadlessChrome user agent, which fired in every headless run. That verifies Headless Chrome too: 9 of the 11 classic entries are now confirmed live. PhantomJS and Nightmare are abandoned and were not run.
- **Three registry entries need new markers.** WebdriverIO's globals, agent-browser's recording cursor and Chrome DevTools MCP's `__dtmcp` only appear in special modes, so in normal use these tools are caught as automation but named after the library underneath.
- **Edge case:** a person clicking inside a browser that automation launched (an agent handing over for a login, a test recorder) also shows these markers and counts as an agent. That is deliberate; see the check tool's README.

## What this does not show yet

- **People.** No human sessions are in this run, so it says nothing yet about how often a real person would be wrongly flagged. That is the number that matters most.
- **Consumer agents and AI frameworks.** Claude in Chrome, Comet, ChatGPT/Codex, Gemini in Chrome and the other consumer agents need to be run by hand; the 15 AI agent frameworks (browser-use, Skyvern, Magnitude and others) need an LLM API key.
- **Scale.** 44 scripted sessions on one page is a sanity check, not a benchmark.

## Next

Run the consumer agents and 30–50 people through the demo page, then `pnpm check:report`. Instructions: [tools/check/README.md](../tools/check/README.md).
