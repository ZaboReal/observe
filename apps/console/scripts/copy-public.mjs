// Copies what the console hosts into public/ (docs/install.md):
//   /sensor/<version>/observe.min.js       immutable, for pinning with an integrity hash
//   /sensor/v1/observe.min.js              the current version, for forwarders that take updates
//   /sensor/manifest.json                  { version, url, integrity }
//   /packages/observe-next[-<version>].tgz the @observe/next package, installable by URL until it is on npm
// Run after building @observe/sensor and @observe/next; the console's dev and build scripts do.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sensorDir = path.resolve(here, "../../../packages/sensor");
const out = path.resolve(here, "../public/sensor");

const { version } = JSON.parse(await readFile(path.join(sensorDir, "package.json"), "utf8"));
const code = (await readFile(path.join(sensorDir, "dist/observe-sensor.min.js"), "utf8")).replace(/\n\/\/# sourceMappingURL=.*\s*$/, "\n");
const integrity = `sha384-${createHash("sha384").update(code).digest("base64")}`;

await rm(out, { recursive: true, force: true });
for (const dir of [version, "v1"]) {
  await mkdir(path.join(out, dir), { recursive: true });
  await writeFile(path.join(out, dir, "observe.min.js"), code);
}
await writeFile(path.join(out, "manifest.json"), `${JSON.stringify({ version, url: `/sensor/${version}/observe.min.js`, integrity }, null, 2)}\n`);
console.log(`sensor ${version} → public/sensor (${(code.length / 1024).toFixed(1)} KB, ${integrity.slice(0, 20)}…)`);

const nextDir = path.resolve(here, "../../../packages/next");
const pkgOut = path.resolve(here, "../public/packages");
const tmp = await mkdtemp(path.join(tmpdir(), "observe-pack-"));
execFileSync("pnpm", ["pack", "--pack-destination", tmp], { cwd: nextDir, stdio: "ignore" });
const [tgz] = (await readdir(tmp)).filter((f) => f.endsWith(".tgz"));
if (!tgz) throw new Error("pnpm pack produced no tarball for @observe/next");
const nextVersion = JSON.parse(await readFile(path.join(nextDir, "package.json"), "utf8")).version;
const tarball = await readFile(path.join(tmp, tgz));
await rm(pkgOut, { recursive: true, force: true });
await mkdir(pkgOut, { recursive: true });
await writeFile(path.join(pkgOut, `observe-next-${nextVersion}.tgz`), tarball);
await writeFile(path.join(pkgOut, "observe-next.tgz"), tarball);
await rm(tmp, { recursive: true, force: true });
console.log(`@observe/next ${nextVersion} → public/packages (${(tarball.length / 1024).toFixed(1)} KB)`);
