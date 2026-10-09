"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { Lock } from "lucide-react";

import type { Choice } from "@/lib/agent-rules";

import { setAgentRuleAction } from "./rule-actions";

/** How a row reads under one choice. */
export interface RuleView {
  choice: Choice;
  policy: string;
  note: string | null;
  /** The priced actions this agent pays for instead, e.g. "Pays: Export report $0.25", when a price applies. */
  pays: string | null;
}

export interface RuleRowView {
  scope: string;
  label: string;
  examples: string;
  /** A limit the site sets for every agent: shown, never changed. */
  locked: boolean;
  /** The subject's own rule, when it has one. */
  own: Choice | null;
  /** What applies without it: its group's rule, or the default. */
  base: RuleView;
  /** How the row reads with each choice as the subject's own rule; null when the row cannot be changed here. */
  options: Record<Choice, RuleView> | null;
}

const CHOICES: { id: Choice; label: string; on: string }[] = [
  { id: "allow", label: "Allow", on: "text-green" },
  { id: "ask", label: "Ask", on: "text-amber" },
  { id: "never", label: "Never", on: "text-red" },
];

/** The rows of the Rules page for one agent, or kind of agent: Allow, Ask or Never per scope. */
export function RulesGrid({ rows, subject, subjectName, siteName }: { rows: RuleRowView[]; subject: string; subjectName: string; siteName: string }) {
  return (
    <ul>
      {rows.map((r) => (
        <RuleRowItem key={r.scope} row={r} subject={subject} subjectName={subjectName} siteName={siteName} />
      ))}
    </ul>
  );
}

function RuleRowItem({ row, subject, subjectName, siteName }: { row: RuleRowView; subject: string; subjectName: string; siteName: string }) {
  // The click shows at once; the server's render replaces it when the save is done (or puts the old rule back).
  const [own, setOwn] = useOptimistic(row.own);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const view = own && row.options ? row.options[own] : row.base;

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1_600);
    return () => clearTimeout(t);
  }, [saved]);

  function choose(choice: Choice | null) {
    // Choosing what applies anyway removes this subject's own rule (as the server does).
    const next = choice === row.base.choice ? null : choice;
    if (!row.options || next === own) return;
    setError(null);
    setSaved(false);
    start(async () => {
      setOwn(next);
      try {
        const r = await setAgentRuleAction(subject, row.scope, next);
        if (r.error) setError(r.error);
        else setSaved(true);
      } catch {
        setError("Could not save the rule. Try again.");
      }
    });
  }

  return (
    <li className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="text-[14px]">{row.label}</div>
        <div className="truncate text-[12px] text-ink-3">
          {view.note ? <span className={view.choice === "ask" ? "text-amber" : "text-ink-2"}>{view.note}. </span> : null}
          {row.examples}
        </div>
        {view.pays && <div className="mt-0.5 truncate text-[12px] text-green">{view.pays}</div>}
        {error && <div className="mt-0.5 text-[12px] text-red">{error}</div>}
      </div>
      <div className="flex max-w-full min-w-0 shrink-0 flex-col items-start gap-1 sm:items-end">
        {row.options ? (
          <div role="group" aria-label={`${row.label}: what ${subjectName} may do`} aria-busy={pending || undefined} className="inline-flex rounded-full bg-track p-[3px] text-[12px] text-ink-3">
            {CHOICES.map((c) => {
              const on = c.id === view.choice;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(c.id)}
                  className={`cursor-pointer rounded-full px-2.5 py-[3px] transition-colors ${on ? `bg-sheet font-medium shadow-pill ${c.on}` : "hover:text-ink"}`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <span className={`inline-flex rounded-full bg-track p-[3px] text-[12px] text-ink-3 ${row.locked ? "opacity-75" : ""}`} aria-hidden="true">
              {CHOICES.map((c) => (
                <span key={c.id} className={`rounded-full px-2.5 py-[3px] ${c.id === view.choice ? `bg-sheet font-medium shadow-pill ${c.on}` : ""}`}>
                  {c.label}
                </span>
              ))}
            </span>
            <span className="sr-only">{CHOICES.find((c) => c.id === view.choice)!.label}</span>
          </>
        )}
        <span className="flex max-w-full min-w-0 items-center gap-1 font-mono text-[10.5px] whitespace-nowrap text-ink-3">
          {row.locked && (
            <>
              <Lock size={10} aria-hidden="true" className="shrink-0" />
              <span>Set by {siteName}</span>
              <span>·</span>
            </>
          )}
          {pending ? (
            <>
              <span>Saving…</span>
              <span>·</span>
            </>
          ) : saved ? (
            <>
              <span className="text-green">Saved</span>
              <span>·</span>
            </>
          ) : own ? (
            <>
              <span className="text-ink-2">Changed</span>
              <span>·</span>
              <button
                type="button"
                onClick={() => choose(null)}
                aria-label={`Reset ${row.label} for ${subjectName}`}
                className="cursor-pointer underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
              >
                Reset
              </button>
              <span>·</span>
            </>
          ) : null}
          <span className="truncate" title={`Policy ${view.policy}`}>
            {view.policy}
          </span>
        </span>
      </div>
    </li>
  );
}
