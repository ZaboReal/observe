import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, rmSync } from "node:fs";
import { stripDocs } from "./strip-docs.mjs";

rmSync("dist", { recursive: true, force: true });

const common = { bundle: true, target: "es2019", sourcemap: true, logLevel: "warning" };

await Promise.all([
  build({ ...common, entryPoints: ["src/index.ts"], format: "esm", outfile: "dist/index.js" }),
  build({ ...common, entryPoints: ["src/index.ts"], format: "cjs", outfile: "dist/index.cjs" }),
  build({ ...common, entryPoints: ["src/global.ts"], format: "iife", outfile: "dist/observe-sensor.js", plugins: [stripDocs] }),
  build({ ...common, entryPoints: ["src/global.ts"], format: "iife", minify: true, outfile: "dist/observe-sensor.min.js", plugins: [stripDocs] }),
]);

const min = readFileSync("dist/observe-sensor.min.js");
console.log(`observe-sensor.min.js  ${(min.length / 1024).toFixed(1)} KB  (${(gzipSync(min).length / 1024).toFixed(1)} KB gzip)`);
