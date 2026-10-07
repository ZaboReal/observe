// esbuild plugin: drops registry documentation (notes, sources, verifiedVersion) from browser bundles.
// The npm module keeps it; the script tag only needs the detection fields.
import { readFile } from "node:fs/promises";

const STRING = String.raw`"(?:[^"\\]|\\.)*"`;
const NOTES = new RegExp(String.raw`\n\s*notes:\s*${STRING}(?:\s*\+\s*${STRING})*\s*,`, "g");
const SOURCES = /\n\s*sources:\s*\[[^\]]*\],/g;
const VERIFIED = new RegExp(String.raw`\n\s*verifiedVersion:\s*${STRING}\s*,`, "g");
const CONSTS = /\nconst [A-Z_]+ = "https?:[^"]*";/g;

export const stripDocs = {
  name: "strip-registry-docs",
  setup(build) {
    build.onLoad({ filter: /registry[\\/]drivers\.ts$/ }, async (args) => {
      const src = await readFile(args.path, "utf8");
      const contents = src.replace(NOTES, "").replace(SOURCES, "\n    sources: [],").replace(VERIFIED, "").replace(CONSTS, "");
      return { contents, loader: "ts" };
    });
  },
};
