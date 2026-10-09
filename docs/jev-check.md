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

The registry lists markers for 48 agents, mostly read from each product's code; only a handful had been seen live. The second run tested every classic framework we can run here, as shipped, three times each (24 sessions). WebdriverIO, agent-browser and Chrome DevTools MCP were caught but named after the library underneath, so they got new markers (Oct 8) and were run three times each again; the table shows those later runs.

| Framework | Caught | Named | Own marker seen | What named it |
| --- | --- | --- | --- | --- |
| Selenium | 3/3 | 3/3 | 3/3 | ChromeDriver's `cdc_` globals |
| Puppeteer | 3/3 | 3/3 | 3/3 | Puppeteer's injected globals |
| nodriver | 3/3 | 3/3 | 3/3 | Its click marker and keyframes |
| Cypress | 3/3 | 3/3 | 3/3 | `window.Cypress` |
| Playwright | 3/3 | 3/3 | 0/3 | Jev, from click and typing mechanics (Playwright 1.53+ injects no globals) |
| WebdriverIO | 3/3 | 3/3 | 3/3 | The `[WDIO]` wrappers it puts around `attachShadow` and `customElements.define` (was: called Selenium or Puppeteer) |
| Chrome DevTools MCP | 3/3 | 3/3 | 3/3 | Its DOM-settle wait in the call stack (was: called Puppeteer, which it is built on) |
| Vercel agent-browser | 3/3 | 3/3 | 3/3 | Jev, from a hint (`window.ModelContext`) and its fill and select mechanics; no exact marker (was: called Puppeteer) |

- **Every session was caught,** by `navigator.webdriver` or the HeadlessChrome user agent, which fired in every headless run. That verifies Headless Chrome too: 9 of the 11 classic entries are now confirmed live. PhantomJS and Nightmare are abandoned and were not run.
- **Three registry entries had markers that only appear in special modes** (WebdriverIO's globals, agent-browser's recording cursor, Chrome DevTools MCP's `__dtmcp`), so in normal use the tools were named after the library underneath (0 of 9). A probe page that records what each tool leaves in the page, compared with plain Chrome, Puppeteer and Selenium, found what they do leave:
  - **WebdriverIO 10** drives Chrome over BiDi by default, and its preload script replaces `attachShadow` and `customElements.define` with wrappers that log `[WDIO]`, from page start. The sensor now reads the source of wrapped built-ins (decisive). It also shows ChromeDriver's `cdc_` globals, as Selenium does, and a global `__name` helper (a naming hint only).
  - **Chrome DevTools MCP 1.10** starts a MutationObserver in the page after every action, and Puppeteer's source URL for that code carries the MCP's own path (`pptr:evaluateHandle;WaitForHelper.waitForStableDom`). The sensor now reads the caller's stack when `MutationObserver.observe` is called (decisive). It also shows Puppeteer's globals, and headless runs report a 3840×2160 screen.
  - **agent-browser 0.38** leaves no exact marker with snapshot refs or CSS selectors, which is how agents usually drive it. Its `data-agent-browser-located` tag appears only with `find text`, `find label` and similar locators; the registry now lists it. It was named from a hint (it launches Chrome with WebMCP testing on, so `window.ModelContext` exists where stable Chrome 154 has it off) and its mechanics (an untrusted `input` then the whole value in one insert; a select that fires only `change`). Jev named it at 95–97%, but the hint stops meaning anything once Chrome turns WebMCP on by default.
- **A product now outranks the library under it.** Registry entries can say what they are built on (Chrome DevTools MCP on Puppeteer, WebdriverIO on ChromeDriver). When the product's own decisive marker is seen, the console and the sensor's rules count the library's markers towards the product rather than naming the library. Plain Puppeteer and Selenium runs are still named Puppeteer and Selenium.
- **Edge case:** a person clicking inside a browser that automation launched (an agent handing over for a login, a test recorder) also shows these markers and counts as an agent. That is deliberate; see the check tool's README.

## Consumer agent: the Claude desktop app's browser

Oct 8 · three runs of the demo's five tasks, driven by Claude through the desktop app's built-in browser pane, the way an agent uses it. Claude in Chrome was not installed in the Chrome on this machine, so it was not run.

| Run | How the agent read the page | Final | Decided by | Jev |
| --- | --- | --- | --- | --- |
| 1 | Accessibility tree and element refs (its normal mode) | Agent, Anthropic browser tooling | Exact match: `__claudeElementMap`, `__claudeRefCounter`, `__generateAccessibilityTree` | 98–99% agent, same product |
| 2 | Same | Agent, Anthropic browser tooling | Exact match | 98% agent, same product |
| 3 | Screenshots only, clicking by coordinates | Agent, **named Playwright (wrong)** | Jev | 98% agent |

- **Caught 3 of 3.** When the agent reads the page through its accessibility tree, the pane injects its element map into the page and the sensor names it at once.
- **Vision-only still caught, but misnamed.** With screenshots and coordinate clicks there is nothing on the page. Jev called it an agent from behaviour alone (zero-pressure presses, the pointer jumping straight to each target, text arriving with no key presses, two tabs reporting focus at once), then picked the closest product it knows. The registry describes its mechanics, but they look like Playwright's, so nothing separates the two yet.
- The same run on a copy of arzach.ai with its real headers (CSP `script-src 'self'`) was caught the same way, and the paper download was logged as an action.

## First real people: arzach.ai (Oct 8)

The first two real visitors after the sensor went live on arzach.ai were both people, and both were misjudged: one (Safari, 20 actions over three pages) was called an agent at 86%, the other (Chrome, 2 actions, a paper download) was left undecided at 83% agent, with the model guessing Microsoft Fara.

What misled it, all of it ordinary hardware or the site itself:

| Signal | Why it fired for a person |
| --- | --- |
| Pointer moved with zero movement deltas | Browsers report positions in fractions of a pixel but movement in whole pixels; Safari reports zero on every move |
| Press and release back to back | A trackpad's tap-to-click releases within a few ms |
| Moved between controls faster than a person can | Trackpad scroll bursts that began before a click are recorded after it, 0 ms later; a typing run ends when the next click takes focus |
| Page scrolled with no wheel, key or touch | The site scrolls itself after a link or button is clicked |
| Screen size typical of agent VMs | 1440x900 is a MacBook screen; agent VMs use ordinary sizes |

And the verdict rule trusted the wrong answer: the model was asked both "is an agent driving?" (86%) and "who is driving?" (a person, 49%), and the console used only the first.

Fixed the same day: the model is asked one question and the agent probability is everything it did not give to a person; an agent needs 85% or more and at least 5 actions; the console discounts the signals above before the model reads a session (so older sensors benefit too); sensor 0.2.1 stops emitting most of them; undecided sessions get their own rules (low-risk actions allowed, the rest ask the person) instead of unknown automation's. Asked again with the cleaned evidence, the model called the two visitors people at 91% and 97%.

## What this does not show yet

- **People.** No human sessions are in this run, so it says nothing yet about how often a real person would be wrongly flagged. That is the number that matters most.
- **Most consumer agents and the AI frameworks.** Only the Claude desktop app's browser has been run. Claude in Chrome, Comet, ChatGPT/Codex, Gemini in Chrome and the others need installing and running by hand; the 15 AI agent frameworks (browser-use, Skyvern, Magnitude and others) need an LLM API key.
- **Scale.** 44 scripted sessions on one page is a sanity check, not a benchmark.

## Next

Run the consumer agents and 30–50 people through the demo page, then `pnpm check:report`. Instructions: [tools/check/README.md](../tools/check/README.md). The arzach.ai pilot ([arzach-pilot.md](arzach-pilot.md)) adds real visitors.
