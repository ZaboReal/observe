"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { clock } from "@/lib/format";
import type { Outcome } from "@/lib/types";

import { LocalTime } from "./local-time";
import { OutcomePill } from "./ui";

export interface FeedItem {
  id: string;
  ts: number;
  sessionId: string;
  driver: string;
  person: string;
  action: string;
  outcome: Outcome;
}

/** Agent actions as they happen. Rows that arrive with a refresh slide in from the top. */
export function LiveFeed({ rows, showFor = true }: { rows: FeedItem[]; showFor?: boolean }) {
  const seen = useRef<Set<string> | null>(null);
  const fresh = seen.current ? new Set(rows.filter((r) => !seen.current!.has(r.id)).map((r) => r.id)) : new Set<string>();

  useEffect(() => {
    seen.current ??= new Set();
    for (const r of rows) seen.current.add(r.id);
  }, [rows]);

  const cols = showFor
    ? "grid-cols-[50px_minmax(0,1fr)_76px] sm:grid-cols-[58px_minmax(0,1.15fr)_minmax(0,1.3fr)_minmax(0,1fr)_84px]"
    : "grid-cols-[50px_minmax(0,1fr)_76px] sm:grid-cols-[58px_minmax(0,1.2fr)_minmax(0,1fr)_84px]";

  return (
    <ul className="grid">
      {rows.map((r) => (
        <li key={r.id} className={`border-t border-line first:border-t-0 ${fresh.has(r.id) ? "feed-new" : ""}`}>
          <Link href={`/sessions/${r.sessionId}`} className={`grid ${cols} items-center gap-x-3 rounded-lg px-2 py-2 text-[13px] transition-colors hover:bg-tile`}>
            <span className="font-mono text-[11.5px] text-ink-3 tabular">
              <LocalTime t={r.ts} format="clock" initial={clock(r.ts)} />
            </span>
            <span className="min-w-0">
              <span className="who agent w-full">
                <span className="min-w-0 truncate">{r.driver}</span>
              </span>
              <span className="mt-0.5 block truncate pl-[15px] text-[12px] text-ink-2 sm:hidden">
                {r.action}
                {showFor ? ` · ${r.person}` : ""}
              </span>
            </span>
            {showFor && <span className="hidden min-w-0 truncate text-ink-2 sm:block">{r.person}</span>}
            <span className="hidden min-w-0 truncate sm:block">{r.action}</span>
            <span className="justify-self-end">
              <OutcomePill outcome={r.outcome} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
