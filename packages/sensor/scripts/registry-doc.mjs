// Writes docs/agent-registry.md from the driver registry. Run after `pnpm build`: node scripts/registry-doc.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { DRIVERS } from "../dist/index.js";

const code = (xs) => (xs?.length ? xs.map((x) => "`" + x + "`").join(", ") : "");
const dom = (d) =>
  [
    code(d?.ids?.map((x) => "#" + x)),
    code(d?.idPrefixes?.map((x) => "#" + x + "…")),
    code(d?.classes?.map((x) => "." + x)),
    code(d?.attributes?.map((x) => "[" + x + "]")),
    code(d?.tags?.map((x) => "<" + x + ">")),
  ]
    .filter(Boolean)
    .join(", ");
const range = (r) => (r ? `${r[0]}–${r[1]} ms` : "");
const mech = (m) =>
  m
    ? [
        m.hoverMs && `hover ${range(m.hoverMs)}`,
        m.pressMs && `press ${range(m.pressMs)}`,
        m.keyGapMs && `key gap ${range(m.keyGapMs)}`,
        m.keyHoldMs && `key hold ${range(m.keyHoldMs)}`,
        m.typing && `typing: ${m.typing}`,
        m.scroll && `scroll: ${m.scroll}`,
        m.teleports && "pointer teleports",
        m.clickCentre && "clicks at exact centre",
        m.screens?.length && `screens ${m.screens.join(", ")}`,
      ]
        .filter(Boolean)
        .join("; ")
    : "";

const KIND_TITLE = {
  extension: "Extension agents",
  "agentic-browser": "Agentic browsers",
  "built-in-agent": "Agents built into browsers",
  framework: "Automation frameworks",
  "cloud-browser": "Cloud browsers and agents",
  "os-cua": "OS-level computer use",
};

let out = `# Agent identifier registry

Generated from \`packages/sensor/src/registry/drivers.ts\` (${DRIVERS.length} drivers). Do not edit by hand; run \`node scripts/registry-doc.mjs\` after \`pnpm build\`.

**Acting** markers mean an agent is driving the page now. **Installed** markers only show a product is present and are used to name a driver once behaviour already says an agent is driving. Confidence: \`source\` (read in code), \`teardown\` (inspected live), \`lab\` (seen in our own runs), \`docs\`, \`secondary\` (one secondary source), \`unverified\`.

`;

for (const [kind, title] of Object.entries(KIND_TITLE)) {
  const list = DRIVERS.filter((d) => d.kind === kind);
  if (!list.length) continue;
  out += `## ${title}\n\n`;
  for (const d of list) {
    out += `### ${d.name}\n\n`;
    out += `\`${d.id}\` · ${d.provider} · confidence: ${d.confidence}${d.verifiedVersion ? ` · checked against ${d.verifiedVersion}` : ""}${d.builtOn ? ` · built on \`${d.builtOn}\`` : ""}\n\n`;
    const rows = [
      ["Acting: page elements", dom(d.activeDom)],
      ["Acting: globals", code([...(d.windowGlobals ?? []), ...(d.documentGlobals ?? []).map((x) => "document." + x)])],
      ["Acting: postMessage types", code(d.messageTypes)],
      ["Acting: console markers", code(d.consoleMarkers)],
      ["Acting: user-agent tokens", code(d.declaredUserAgent)],
      ["Acting: stack markers", code(d.stackMarkers)],
      ["Acting: wrapped built-ins", code(d.wrapperMarkers)],
      ["Residue (lingers after use)", [dom(d.residueDom), code(d.styleIds?.map((x) => "#" + x))].filter(Boolean).join(", ")],
      ["Keyframes", code(d.keyframes)],
      ["Installed: page elements", [dom(d.presence?.dom), code(d.presence?.styleIds?.map((x) => "#" + x))].filter(Boolean).join(", ")],
      ["Installed: globals", code([...(d.presence?.windowGlobals ?? []), ...(d.navigatorProps ?? []).map((x) => "navigator." + x)])],
      ["Installed: CSS probes", (d.presence?.cssProbes ?? []).map((p) => `${p.id ? "#" + p.id : "." + p.className} → ${Object.entries(p.expect).map(([k, v]) => `${k}: ${v}`).join(", ")}`).join("; ")],
      ["Browser identity", code([...(d.brands ?? []), ...(d.userAgent ?? [])])],
      ["Extension ids", code(d.extensionIds)],
      ["Input mechanics", mech(d.mechanics)],
    ].filter(([, v]) => v);
    if (rows.length) {
      out += `| | |\n| --- | --- |\n`;
      for (const [k, v] of rows) out += `| ${k} | ${v.replace(/\|/g, "\\|")} |\n`;
      out += "\n";
    }
    if (d.notes) out += `${d.notes}\n\n`;
    if (d.sources?.length) out += `Sources: ${d.sources.map((s) => `<${s}>`).join(" · ")}\n\n`;
  }
}

const server = JSON.parse(readFileSync(new URL("../../../data/server-agents.json", import.meta.url), "utf8"));
out += `## Server-side identifiers\n\nFrom \`data/server-agents.json\` (${server.agents.length} entries), for the server module. User-agent tokens are claims; confirm them with the IP list, reverse DNS or a Web Bot Auth signature.\n\n`;
out += `| Operator | Product | Purpose | UA token | IP ranges | Reverse DNS | Web Bot Auth | Confidence |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
for (const a of server.agents) {
  const wba = [a.signatureAgent ? "`" + a.signatureAgent + "`" : "", a.keyDirectory ? `<${a.keyDirectory}>` : ""].filter(Boolean).join(" ");
  out += `| ${a.operator} | ${a.product} | ${a.purpose} | ${a.ua ? "`" + a.ua + "`" : a.uaNote ?? ""} | ${a.ipRanges ? `<${a.ipRanges}>` : ""} | ${(a.rdns ?? []).map((r) => "`" + r + "`").join(", ")} | ${wba} | ${a.confidence} |\n`;
}
out += `\n${server.webBotAuth.notes.map((n) => `- ${n}`).join("\n")}\n`;

writeFileSync(new URL("../../../docs/agent-registry.md", import.meta.url), out);
console.log(`docs/agent-registry.md: ${DRIVERS.length} drivers`);
