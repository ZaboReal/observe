// Rebuilds the script-tag bundle on change and serves the demo page.
// Usage: pnpm dev  (then open http://localhost:5317/examples/demo.html)
import { context } from "esbuild";
import { stripDocs } from "./strip-docs.mjs";

const port = Number(process.env.PORT ?? 5317);
const ctx = await context({
  entryPoints: ["src/global.ts"],
  bundle: true,
  format: "iife",
  target: "es2019",
  sourcemap: true,
  outfile: "dist/observe-sensor.js",
  plugins: [stripDocs],
  logLevel: "info",
});
await ctx.watch();
const { port: actual } = await ctx.serve({ servedir: ".", port });
console.log(`\n  Demo:  http://localhost:${actual}/examples/demo.html`);
console.log(`  Lab:   http://localhost:${actual}/examples/demo.html?observe_driver=human\n`);
