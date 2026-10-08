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

export const FRAMEWORKS = { playwright, puppeteer, selenium };
export const VARIANTS = ["default", "stealth", "human", "careful"];
export const supports = (framework, variant) => !(framework === "selenium" && (variant === "human" || variant === "careful"));

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
