// Adapters that drive the sensor demo page with Playwright, Puppeteer and Selenium.
// Variants:
//   default  the framework as shipped (navigator.webdriver set, headless unless --headed)
//   stealth  automation flags hidden: no --enable-automation, AutomationControlled off, a normal user agent
//   human    stealth plus human-like input: curved pointer paths, real hover and press times, per-key typing, wheel scrolling
//   careful  human, with pointer positions rounded to whole pixels as a real mouse reports them
import { execFileSync } from "node:child_process";

export const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

/** A normal desktop Chrome user agent for this Chrome version, without "HeadlessChrome". */
export function cleanUserAgent() {
  const version = execFileSync(CHROME, ["--version"]).toString().match(/(\d+)\./)?.[1] ?? "150";
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36`;
}

const STEALTH_ARGS = ["--disable-blink-features=AutomationControlled"];
const VIEWPORT = { width: 1366, height: 860 };

/**
 * Pointer path from (x0,y0) to (x1,y1): a cubic Bézier with random control points, eased so it starts and
 * ends slowly, with small jitter. Returns points to move through.
 */
function curve(x0, y0, x1, y1) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(12, Math.min(60, Math.round(dist / 12)));
  const bend = Math.min(140, dist * 0.35);
  const c1 = [x0 + (x1 - x0) * 0.3 + rand(-bend, bend), y0 + (y1 - y0) * 0.3 + rand(-bend, bend)];
  const c2 = [x0 + (x1 - x0) * 0.75 + rand(-bend / 2, bend / 2), y0 + (y1 - y0) * 0.75 + rand(-bend / 2, bend / 2)];
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const t = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    const m = 1 - t;
    const x = m ** 3 * x0 + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t ** 3 * x1;
    const y = m ** 3 * y0 + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t ** 3 * y1;
    pts.push(i === n ? [x1, y1] : [x + rand(-0.8, 0.8), y + rand(-0.8, 0.8)]);
  }
  return pts;
}

/** A point inside the middle of a box, rarely the exact centre. */
const aim = (box) => [box.x + box.width * rand(0.3, 0.7), box.y + box.height * rand(0.3, 0.7)];

/**
 * Human-like input on top of three primitives every framework has: move(x,y), down(), up(), key(char), wheel(dy).
 * Positions are tracked here because the frameworks do not report the pointer position.
 */
function humanInput(p, { whole = false } = {}) {
  const px = (v) => (whole ? Math.round(v) : v);
  let pos = [rand(200, 600), rand(150, 400)];
  return {
    async click(box) {
      const [x, y] = aim(box).map(px);
      for (const [cx, cy] of curve(pos[0], pos[1], x, y)) {
        await p.move(px(cx), px(cy));
        await sleep(rand(6, 18));
      }
      pos = [x, y];
      await sleep(rand(80, 260));
      await p.down();
      await sleep(rand(60, 140));
      await p.up();
    },
    async type(text) {
      for (const ch of text) {
        await p.key(ch, rand(45, 110));
        await sleep(rand(70, 230));
      }
    },
    async scrollUntil(visible) {
      for (let i = 0; i < 60 && !(await visible()); i++) {
        await p.wheel(Math.round(rand(40, 130)));
        await sleep(rand(30, 110));
      }
    },
  };
}

// ───────────────────────── Playwright ─────────────────────────

async function playwright({ variant, headed }) {
  const { chromium } = await import("playwright-core");
  const stealth = variant !== "default";
  const humanLike = variant === "human" || variant === "careful";
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: !headed,
    args: stealth ? STEALTH_ARGS : [],
    ignoreDefaultArgs: stealth ? ["--enable-automation"] : [],
  });
  const context = await browser.newContext(stealth ? { userAgent: cleanUserAgent(), viewport: VIEWPORT } : {});
  const page = await context.newPage();
  const human = humanInput({
    move: (x, y) => page.mouse.move(x, y),
    down: () => page.mouse.down(),
    up: () => page.mouse.up(),
    key: async (ch, hold) => {
      await page.keyboard.down(ch);
      await sleep(hold);
      await page.keyboard.up(ch);
    },
    wheel: (dy) => page.mouse.wheel(0, dy),
  }, { whole: variant === "careful" });
  const box = async (sel) => (await page.locator(sel).boundingBox()) ?? { x: 0, y: 0, width: 1, height: 1 };
  return {
    goto: (url) => page.goto(url),
    eval: (fn) => page.evaluate(fn),
    waitFor: (fn) => page.waitForFunction(fn),
    click: (sel) => (humanLike ? box(sel).then((b) => human.click(b)) : page.click(sel)),
    type: (sel, text) => (humanLike ? human.type(text) : page.fill(sel, text)),
    select: async (sel, label) => {
      if (humanLike) {
        await human.click(await box(sel));
        await page.keyboard.press("Escape");
      }
      await page.selectOption(sel, { label });
    },
    scrollTo: (sel) =>
      humanLike
        ? human.scrollUntil(() => page.locator(sel).evaluate((el) => el.getBoundingClientRect().top < innerHeight * 0.6))
        : page.locator(sel).scrollIntoViewIfNeeded(),
    close: () => browser.close(),
  };
}

// ───────────────────────── Puppeteer ─────────────────────────

async function puppeteer({ variant, headed }) {
  const { default: pptr } = await import("puppeteer-core");
  const stealth = variant !== "default";
  const humanLike = variant === "human" || variant === "careful";
  const browser = await pptr.launch({
    executablePath: CHROME,
    headless: !headed,
    args: stealth ? STEALTH_ARGS : [],
    ignoreDefaultArgs: stealth ? ["--enable-automation"] : [],
    defaultViewport: stealth ? VIEWPORT : { width: 800, height: 600 },
  });
  const page = await browser.newPage();
  if (stealth) await page.setUserAgent(cleanUserAgent());
  const human = humanInput({
    move: (x, y) => page.mouse.move(x, y),
    down: () => page.mouse.down(),
    up: () => page.mouse.up(),
    key: async (ch, hold) => {
      await page.keyboard.down(ch);
      await sleep(hold);
      await page.keyboard.up(ch);
    },
    wheel: (dy) => page.mouse.wheel({ deltaY: dy }),
  }, { whole: variant === "careful" });
  const box = async (sel) => (await (await page.$(sel))?.boundingBox()) ?? { x: 0, y: 0, width: 1, height: 1 };
  return {
    goto: (url) => page.goto(url),
    eval: (fn) => page.evaluate(fn),
    waitFor: (fn) => page.waitForFunction(fn),
    click: (sel) => (humanLike ? box(sel).then((b) => human.click(b)) : page.click(sel)),
    type: (sel, text) => (humanLike ? human.type(text) : page.type(sel, text)),
    select: async (sel, label) => {
      if (humanLike) {
        await human.click(await box(sel));
        await page.keyboard.press("Escape");
      }
      await page.select(sel, label);
    },
    scrollTo: (sel) =>
      humanLike
        ? human.scrollUntil(() => page.$eval(sel, (el) => el.getBoundingClientRect().top < innerHeight * 0.6))
        : page.$eval(sel, (el) => el.scrollIntoView()),
    close: () => browser.close(),
  };
}

// ───────────────────────── Selenium ─────────────────────────

async function selenium({ variant, headed }) {
  if (variant === "human" || variant === "careful") throw new Error("Selenium runs default and stealth only");
  const { Builder, By } = await import("selenium-webdriver");
  const chrome = await import("selenium-webdriver/chrome.js");
  const options = new chrome.Options().setChromeBinaryPath(CHROME).addArguments("--window-size=1280,800");
  if (!headed) options.addArguments("--headless=new");
  if (variant === "stealth") {
    options.excludeSwitches("enable-automation");
    options.addArguments(...STEALTH_ARGS, `--user-agent=${cleanUserAgent()}`);
  }
  const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
  const el = (sel) => driver.findElement(By.css(sel));
  return {
    goto: (url) => driver.get(url),
    eval: (fn) => driver.executeScript(`return (${fn.toString()})()`),
    waitFor: (fn) => driver.wait(() => driver.executeScript(`return !!(${fn.toString()})()`), 15_000),
    click: async (sel) => (await el(sel)).click(),
    type: async (sel, text) => (await el(sel)).sendKeys(text),
    select: async (sel, label) => (await driver.findElement(By.xpath(`//select[@id="${sel.slice(1)}"]/option[text()="${label}"]`))).click(),
    scrollTo: async (sel) => driver.executeScript("arguments[0].scrollIntoView()", await el(sel)),
    close: () => driver.quit(),
  };
}

// ───────────────────────── WebdriverIO ─────────────────────────

async function webdriverio({ headed }) {
  const { remote } = await import("webdriverio");
  const browser = await remote({
    logLevel: "error",
    capabilities: {
      browserName: "chrome",
      "goog:chromeOptions": { binary: CHROME, args: [...(headed ? [] : ["--headless=new"]), "--window-size=1280,800"] },
    },
  });
  return {
    goto: (url) => browser.url(url),
    eval: (fn) => browser.execute(fn),
    waitFor: (fn) => browser.waitUntil(() => browser.execute(fn), { timeout: 15_000 }),
    click: (sel) => browser.$(sel).click(),
    type: (sel, text) => browser.$(sel).setValue(text),
    select: (sel, label) => browser.$(sel).selectByVisibleText(label),
    scrollTo: (sel) => browser.$(sel).scrollIntoView(),
    close: () => browser.deleteSession(),
  };
}

// ───────────────────────── Chrome DevTools MCP ─────────────────────────

/** How an agent would find each demo control in the accessibility snapshot Chrome DevTools MCP returns. */
const SNAPSHOT_TARGETS = {
  "#q": /uid=(\S+) searchbox/,
  "#status": /uid=(\S+) combobox[^\n]*value="All statuses"/,
  "#export": /uid=(\S+) button "Export CSV"/,
  "#email": /uid=(\S+) textbox "Invite a teammate"/,
  '#invite button[type="submit"]': /uid=(\S+) button "Send invite"/,
  "#weekly": /uid=(\S+) checkbox "Weekly summary"/,
};

async function devtoolsMcp({ headed }) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const server = new URL("../node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js", import.meta.url).pathname;
  const transport = new StdioClientTransport({
    command: process.execPath,
    // No usage statistics or CrUX lookups: test runs are not reported to Google.
    args: [server, "--isolated", "--usageStatistics=false", "--performanceCrux=false", "--executablePath", CHROME, ...(headed ? [] : ["--headless"])],
    env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1" },
    stderr: "ignore",
  });
  const client = new Client({ name: "observe-check", version: "0.1.0" });
  await client.connect(transport);
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = r.content.map((c) => c.text ?? "").join("\n");
    if (r.isError) throw new Error(`${name}: ${text.slice(0, 200)}`);
    return text;
  };
  let pageId = null;
  const uid = async (sel) => {
    const snapshot = await call("take_snapshot", { pageId });
    const m = snapshot.match(SNAPSHOT_TARGETS[sel]);
    if (!m) throw new Error(`no ${sel} in the snapshot`);
    return m[1];
  };
  const evaluate = async (fn) => {
    const text = await call("evaluate_script", { pageId, function: fn.toString() });
    const json = text.match(/```json\s*([\s\S]*?)```/);
    try {
      return json ? JSON.parse(json[1]) : undefined;
    } catch {
      return undefined; // e.g. a function that returns nothing
    }
  };
  return {
    goto: async (url) => {
      const pages = await call("new_page", { url });
      pageId = Number(pages.match(/(\d+): [^\n]*\[selected\]/)?.[1]);
    },
    eval: evaluate,
    waitFor: async (fn) => {
      for (let i = 0; i < 30 && !(await evaluate(fn)); i++) await sleep(500);
    },
    click: async (sel) => call("click", { pageId, uid: await uid(sel) }),
    type: async (sel, text) => call("fill", { pageId, uid: await uid(sel), value: text }),
    select: async (sel, label) => call("fill", { pageId, uid: await uid(sel), value: label }),
    // Clicking scrolls the target into view, as an agent using these tools would rely on.
    scrollTo: async () => {},
    close: () => client.close(),
  };
}

// ───────────────────────── Vercel agent-browser ─────────────────────────

async function agentBrowser({ headed }) {
  const { execFile } = await import("node:child_process");
  const bin = new URL("../node_modules/.bin/agent-browser", import.meta.url).pathname;
  const env = { ...process.env, AGENT_BROWSER_SESSION: `check-${process.pid}-${Math.random().toString(36).slice(2, 8)}`, AGENT_BROWSER_EXECUTABLE_PATH: CHROME };
  const run = (...args) =>
    new Promise((resolve, reject) =>
      execFile(bin, [...(headed ? ["--headed"] : []), ...args], { env, timeout: 30_000 }, (err, stdout, stderr) =>
        err ? reject(new Error(`agent-browser ${args[0]}: ${(stderr || err.message).trim().split("\n")[0]}`)) : resolve(stdout),
      ),
    );
  const evaluate = async (fn) => JSON.parse(await run("--json", "eval", `(${fn.toString()})()`)).data?.result;
  return {
    goto: (url) => run("open", url),
    eval: evaluate,
    waitFor: async (fn) => {
      for (let i = 0; i < 30 && !(await evaluate(fn)); i++) await sleep(500);
    },
    click: (sel) => run("click", sel),
    type: (sel, text) => run("fill", sel, text),
    select: (sel, label) => run("select", sel, label),
    scrollTo: (sel) => run("scrollintoview", sel),
    close: () => run("close"),
  };
}

// ───────────────────────── nodriver (Python) ─────────────────────────

/** nodriver is Python, so it runs the whole session in one script and prints the sensor's session id. */
async function nodriver({ url, headed }) {
  const { execFile } = await import("node:child_process");
  const script = new URL("./nodriver_run.py", import.meta.url).pathname;
  return new Promise((resolve, reject) =>
    execFile(
      "uv",
      ["run", "--quiet", "--with", "nodriver", "python", script, url, headed ? "headed" : "headless"],
      { env: { ...process.env, CHROME_PATH: CHROME }, timeout: 120_000 },
      (err, stdout, stderr) => (err ? reject(new Error(`nodriver: ${(stderr || err.message).trim().split("\n").pop()}`)) : resolve(stdout.trim().split("\n").pop())),
    ),
  );
}

// ───────────────────────── Cypress ─────────────────────────

/** Cypress runs the tasks as a spec (cypress/demo.cy.mjs) in system Chrome and writes the session id to a file. */
async function cypress({ url, headed }) {
  const { execFile } = await import("node:child_process");
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const out = `${mkdtempSync(`${tmpdir()}/observe-cypress-`)}/session.txt`;
  const cwd = new URL("..", import.meta.url).pathname;
  const bin = new URL("../node_modules/.bin/cypress", import.meta.url).pathname;
  await new Promise((resolve, reject) =>
    execFile(
      bin,
      ["run", "--browser", "chrome", ...(headed ? ["--headed"] : ["--headless"]), "--config-file", "cypress/cypress.config.mjs"],
      // cypress.config.mjs exposes these to the spec; URLs with & and = are awkward on the command line.
      { cwd, env: { ...process.env, OBSERVE_URL: url, OBSERVE_OUT: out, CYPRESS_CRASH_REPORTS: "0" }, timeout: 180_000 },
      (err, stdout) => (err ? reject(new Error(`cypress: ${(stdout.match(/\d+\) .*|Error:.*$/m)?.[0] ?? err.message).trim()}`)) : resolve()),
    ),
  );
  return readFileSync(out, "utf8").trim();
}

export const FRAMEWORKS = { playwright, puppeteer, selenium, webdriverio, "chrome-devtools-mcp": devtoolsMcp, "agent-browser": agentBrowser, nodriver, cypress };

/** Frameworks that run a whole session themselves and return the sensor's session id. */
export const WHOLE_RUN = new Set(["nodriver", "cypress"]);
export const VARIANTS = ["default", "stealth", "human", "careful"];
export function supports(framework, variant) {
  if (framework === "playwright" || framework === "puppeteer") return true;
  if (framework === "selenium") return variant === "default" || variant === "stealth";
  // The other frameworks run as shipped: these runs check their markers.
  return variant === "default";
}

/** The demo page's five tasks, with think time between steps for the human variant. */
export async function runTasks(d, variant) {
  const think = () => sleep(variant === "human" || variant === "careful" ? rand(400, 1400) : variant === "stealth" ? rand(100, 300) : 0);
  await d.click("#q");
  await d.type("#q", "northwind");
  await think();
  await d.select("#status", "Paid");
  await think();
  await d.click("#export");
  await think();
  await d.click("#email");
  await d.type("#email", "sam@example.com");
  await think();
  await d.click('#invite button[type="submit"]');
  await think();
  await d.scrollTo("#settings");
  await think();
  await d.click("#weekly");
}
