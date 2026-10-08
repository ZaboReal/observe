// Drives each framework and variant through the sensor demo with the sensor reporting to the console,
// then prints what Jev, exact matches and the sensor's rules decided for every session.
//
//   pnpm dev:console            # console with Jev on :3100 (needs TYPESAFE_API_KEY in apps/console/.env.local)
//   pnpm dev:sensor             # demo page on :5317
//   pnpm check                  # all frameworks and variants, headless
//   pnpm check --frameworks playwright --variants human --headed --repeat 3
//   pnpm check --variants default --repeat 3 --parallel 6      # every framework as shipped: a marker check
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { FRAMEWORKS, VARIANTS, WHOLE_RUN, runTasks, supports } from "./frameworks.mjs";
import { report } from "./report.mjs";

const { values: opts } = parseArgs({
  options: {
    frameworks: { type: "string", default: Object.keys(FRAMEWORKS).join(",") },
    variants: { type: "string", default: VARIANTS.join(",") },
    repeat: { type: "string", default: "1" },
    parallel: { type: "string", default: "4" },
    headed: { type: "boolean", default: false },
    demo: { type: "string", default: "http://localhost:5317" },
    console: { type: "string", default: "http://localhost:3100" },
  },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reachable(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(5000) })).ok;
  } catch {
    return false;
  }
}

if (!(await reachable(`${opts.demo}/examples/demo.html`))) {
  console.error(`The sensor demo is not running at ${opts.demo}. Start it with: pnpm dev:sensor`);
  process.exit(1);
}
if (!(await reachable(`${opts.console}/api/v1/sensor-sessions`))) {
  console.error(`The console is not running at ${opts.console}. Start it with: pnpm dev:console`);
  process.exit(1);
}

const since = Date.now() - 1000;
const frameworks = opts.frameworks.split(",").filter((f) => FRAMEWORKS[f]);
const variants = opts.variants.split(",").filter((v) => VARIANTS.includes(v));
const jobs = [];
for (let n = 0; n < Number(opts.repeat); n++) {
  for (const framework of frameworks) for (const variant of variants) if (supports(framework, variant)) jobs.push({ framework, variant });
}
console.log(`${jobs.length} runs, ${Math.max(1, Number(opts.parallel) || 1)} at a time\n`);

async function runOne({ framework, variant }) {
  const run = { framework, variant, label: framework, sessionId: null, ok: false, error: null, ms: 0 };
  const started = Date.now();
  const url = `${opts.demo}/examples/demo.html?observe_driver=${framework}&observe_endpoint=${encodeURIComponent(`${opts.console}/api`)}&observe_debug=0`;
  let d = null;
  try {
    if (WHOLE_RUN.has(framework)) {
      run.sessionId = await FRAMEWORKS[framework]({ url, variant, headed: opts.headed });
    } else {
      d = await FRAMEWORKS[framework]({ variant, headed: opts.headed });
      await d.goto(url);
      await d.waitFor(() => Boolean(window.ObserveSensor && window.ObserveSensor.instance));
      await runTasks(d, variant);
      // Give the sensor's delayed probes (1 s and 3 s after load) a chance to run before the session ends.
      await sleep(Math.max(0, 3500 - (Date.now() - started)));
      run.sessionId = await d.eval(() => window.ObserveSensor.instance.sessionId);
      // destroy() sends whatever is queued with sendBeacon.
      await d.eval(() => window.ObserveSensor.instance.destroy());
      await sleep(1500);
    }
    run.ok = Boolean(run.sessionId);
    if (!run.ok) run.error = "no session id";
  } catch (e) {
    run.error = e instanceof Error ? e.message.split("\n")[0] : String(e);
  } finally {
    await d?.close().catch(() => {});
    run.ms = Date.now() - started;
    console.log(`${framework.padEnd(20)} ${variant.padEnd(8)} ${run.ok ? `done in ${(run.ms / 1000).toFixed(1)} s` : `failed: ${run.error}`}`);
  }
  return run;
}

// A small pool: each worker takes the next job until none are left.
const runs = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs.length, Math.max(1, Number(opts.parallel) || 1)) }, async () => {
    while (next < jobs.length) runs.push(await runOne(jobs[next++]));
  }),
);

mkdirSync(new URL("../results/", import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../results/runs-${stamp}.json`, import.meta.url), JSON.stringify({ since, runs }, null, 2));
await report({ consoleUrl: opts.console, since, runs, stamp });
