// Reads the console's sensor sessions and reports, for every labelled session, what decided its verdict
// and whether Jev got it right. Runs from the check runner, or on its own for manual runs:
//
//   node src/report.mjs --since 30m          # every labelled session in the last 30 minutes (human, claude-in-chrome, …)
import { writeFileSync, mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (p) => (typeof p === "number" ? `${Math.round(p * 100)}%` : "—");

async function fetchSessions(consoleUrl, since) {
  const res = await fetch(`${consoleUrl}/api/v1/sensor-sessions?since=${since}`);
  if (!res.ok) throw new Error(`Console returned ${res.status}`);
  return (await res.json()).sessions;
}

/** Wait until Jev has answered on every session's final evidence (or failed), up to a limit. */
async function settled(consoleUrl, since, ids, timeoutMs = 25_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const sessions = await fetchSessions(consoleUrl, since);
    const mine = sessions.filter((s) => !ids.length || ids.includes(s.id));
    const waiting = mine.filter((s) => s.jevPending || (!s.jev && !s.jevError && s.decision.decidedBy !== "exact-match"));
    if ((!waiting.length && mine.length >= ids.length) || Date.now() > until) return sessions;
    await sleep(1000);
  }
}

const decisionText = (d, name) =>
  d.verdict === "agent" ? `agent · ${d.driverId ? name(d.driverId) : "unnamed"}` : d.verdict === "human" ? "person" : "undecided";

export async function report({ consoleUrl, since, runs = [], stamp = new Date().toISOString().replace(/[:.]/g, "-") }) {
  const ids = runs.map((r) => r.sessionId).filter(Boolean);
  const sessions = await settled(consoleUrl, since, ids);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const name = (id) => id;

  // Every runner session, plus labelled sessions from manual runs (people, consumer agents).
  const rows = [];
  for (const r of runs) rows.push({ run: `${r.framework} · ${r.variant}`, label: r.label, s: r.sessionId ? byId.get(r.sessionId) : null, error: r.error });
  for (const s of sessions) if (s.label && !ids.includes(s.id)) rows.push({ run: `${s.label} · manual`, label: s.label, s, error: null });

  // Per agent: how often the final verdict caught it, named it, and what decided.
  const byLabel = new Map();
  for (const { label, s } of rows) {
    const g = byLabel.get(label) ?? { runs: 0, failed: 0, caught: 0, named: 0, own: 0, jevCaught: 0, jevNamed: 0, decidedBy: new Map(), markers: new Map() };
    byLabel.set(label, g);
    g.runs++;
    if (!s) {
      g.failed++;
      continue;
    }
    const wantAgent = label !== "human";
    if (wantAgent ? s.decision.verdict === "agent" : s.decision.verdict === "human") g.caught++;
    if (wantAgent && s.decision.driverId === label) g.named++;
    if (s.jev && (wantAgent ? s.jev.agentProbability >= 0.85 : s.jev.agentProbability <= 0.15)) g.jevCaught++;
    if (wantAgent && s.jev?.choice === label) g.jevNamed++;
    const by = s.decision.decidedBy ?? "—";
    g.decidedBy.set(by, (g.decidedBy.get(by) ?? 0) + 1);
    if (s.exactMatch) g.markers.set(s.exactMatch.label, (g.markers.get(s.exactMatch.label) ?? 0) + 1);
    // Did a marker the registry lists for this very agent show up? Screen sizes are shared hints, not markers.
    if ((s.signals ?? []).some((o) => o.id !== "env.agent-screen" && o.drivers.includes(label))) g.own++;
  }
  const counts = (m) => [...m.entries()].map(([k, n]) => `${k} ${n}`).join(", ") || "—";

  const lines = [
    `# Jev check · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    "## By agent",
    "",
    "| Agent | Runs | Caught | Named | Own marker seen | Jev caught | Jev named | Decided by | Exact match seen |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...[...byLabel.entries()].map(([label, g]) => {
      const ran = g.runs - g.failed;
      const named = label === "human" ? "—" : `${g.named}/${ran}`;
      const jevNamed = label === "human" ? "—" : `${g.jevNamed}/${ran}`;
      const own = label === "human" ? "—" : `${g.own}/${ran}`;
      return `| ${label} | ${g.runs}${g.failed ? ` (${g.failed} failed)` : ""} | ${g.caught}/${ran} | ${named} | ${own} | ${g.jevCaught}/${ran} | ${jevNamed} | ${counts(g.decidedBy)} | ${counts(g.markers)} |`;
    }),
    "",
    "**Caught** means the final verdict was right (agent for agents, person for `human`); **named** means it also named the right product; **own marker seen** means a marker the registry lists for that agent appeared on the page.",
    "",
    "## Every session",
    "",
    "Each row is one session on the sensor demo. **Final** is what the console shows; **Jev** is Jev's own answer even when an exact match decided.",
    "",
    "| Run | Truth | Final | Decided by | Jev: agent? | Jev's pick | Sensor rules | Actions | Right? |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  let jevRight = 0, jevTotal = 0, namedRight = 0, namedTotal = 0, finalRight = 0, finalTotal = 0;
  for (const { run, label, s, error } of rows) {
    if (!s) {
      lines.push(`| ${run} | ${label} | ${error ? `run failed: ${error}` : "no session reached the console"} | | | | | | |`);
      continue;
    }
    const truth = label === "human" ? "person" : `agent · ${label}`;
    const wantAgent = label !== "human";
    const jev = s.jev;
    const jevVerdict = jev ? (jev.agentProbability >= 0.85 ? "agent" : jev.agentProbability <= 0.15 ? "human" : "unknown") : null;
    const jevOk = jev ? (wantAgent ? jevVerdict === "agent" : jevVerdict === "human") : null;
    if (jevOk !== null) {
      jevTotal++;
      if (jevOk) jevRight++;
    }
    if (jev && wantAgent) {
      namedTotal++;
      if (jev.choice === label) namedRight++;
    }
    const finalOk = wantAgent ? s.decision.verdict === "agent" : s.decision.verdict === "human";
    finalTotal++;
    if (finalOk) finalRight++;
    const rules = s.rules ? `${s.rules.verdict}${s.rules.driverId ? ` · ${s.rules.driverId}` : ""}` : "—";
    const jevCell = jev ? `${pct(jev.agentProbability)}` : s.jevError ? `error: ${s.jevError.slice(0, 60)}` : "—";
    const pick = jev ? `${jev.choice} (${pct(jev.candidates.find((c) => c.id === jev.choice)?.p)})` : "—";
    lines.push(
      `| ${run} | ${truth} | ${decisionText(s.decision, name)} | ${s.decision.decidedBy ?? "—"} | ${jevCell} | ${pick} | ${rules} | ${s.actions} | ${finalOk ? "yes" : "**no**"} |`,
    );
  }
  lines.push(
    "",
    `- **Final verdict right:** ${finalRight} of ${finalTotal} sessions.`,
    `- **Jev alone, agent vs person:** ${jevRight} of ${jevTotal} (agent at 85% or more, person at 15% or less; in between counts as wrong).`,
    `- **Jev named the right agent:** ${namedRight} of ${namedTotal} agent sessions.`,
    "",
    "This is a sanity check, not a benchmark: a handful of scripted runs on one page. Sessions from real people are what show how often a person would be wrongly flagged.",
  );

  const text = lines.join("\n");
  console.log(`\n${text}\n`);
  const dir = new URL("../results/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL(`report-${stamp}.md`, dir), text);
  writeFileSync(new URL("latest.md", dir), text);
  return text;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { since: { type: "string", default: "60m" }, console: { type: "string", default: "http://localhost:3100" } } });
  const minutes = Number(values.since.replace(/m$/, "")) || 60;
  await report({ consoleUrl: values.console, since: Date.now() - minutes * 60_000 });
}
