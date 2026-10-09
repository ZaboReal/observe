import Link from "next/link";

import { num } from "@/lib/format";
import type { Verdict } from "@/lib/types";

import { Time } from "./time";
import { LiveDot, Who } from "./ui";

interface Tab {
  id: string;
  verdict: Verdict;
  driver: string | null;
  startedAt: number;
  live: boolean;
  pages: number;
  last: { action: string | null } | null;
}

/**
 * The tabs of one visit, as a strip of segments with the open tab raised (like the segmented control).
 * Each tab keeps its own verdict: tabs are shown together, never decided together.
 */
export function VisitTabs({ tabs, current }: { tabs: Tab[]; current: string }) {
  return (
    <section aria-labelledby="visit-tabs" className="mb-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 id="visit-tabs" className="eyebrow">
          This visit · {tabs.length} tabs
        </h2>
        <p className="text-[12px] text-ink-3">Each tab is decided on its own</p>
      </div>
      {/* Few tabs share the width; many wrap into equal columns. */}
      <ol className="grid grid-cols-1 gap-[3px] rounded-[14px] bg-track p-[3px] sm:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        {tabs.map((t) => {
          const here = t.id === current;
          const body = (
            <>
              <div className="flex items-center justify-between gap-3">
                <Who verdict={t.verdict} className="text-[13px] font-medium">
                  {t.verdict === "agent" ? (t.driver ?? "Unknown automation") : undefined}
                </Who>
                <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11.5px] text-ink-3 tabular">
                  {t.live && <LiveDot small />}
                  <Time t={t.startedAt} />
                </span>
              </div>
              <div className="mt-0.5 truncate pl-[15px] text-[12px] text-ink-3">
                {num(t.pages)} {t.pages === 1 ? "page" : "pages"}
                {t.last?.action ? ` · ${t.last.action}` : ""}
                {here ? " · this tab" : ""}
              </div>
            </>
          );
          const cell = "block rounded-[11px] px-3 py-2 transition-colors";
          return (
            <li key={t.id} className="min-w-0">
              {here ? (
                <div aria-current="page" className={`${cell} bg-sheet shadow-pill`}>
                  {body}
                </div>
              ) : (
                <Link href={`/sessions/${t.id}`} className={`${cell} hover:bg-sheet/60`}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
