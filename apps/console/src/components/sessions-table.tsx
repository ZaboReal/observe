"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { TIER_LABEL, accountText, ago, clock, personOf } from "@/lib/format";
import type { SessionRow } from "@/lib/queries";

import { LocalTime } from "./local-time";
import { StatusPill, Who } from "./ui";

/** Sessions in the site's style: Person, Driven by, Status, Last action. Phones keep the first two. */
export function SessionsTable({
  rows,
  now,
  anonymous = false,
  markSensor = false,
}: {
  rows: SessionRow[];
  now: number;
  /** Visitors are not signed in, so there is no account to show. */
  anonymous?: boolean;
  /** Tag sessions that came from the sensor, when they sit among generated demo traffic. */
  markSensor?: boolean;
}) {
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);
  const fresh = seen.current ? new Set(rows.filter((r) => !seen.current!.has(r.id)).map((r) => r.id)) : new Set<string>();

  useEffect(() => {
    seen.current ??= new Set();
    for (const r of rows) seen.current.add(r.id);
  }, [rows]);

  return (
    <table className="tbl table-fixed text-[13.5px]">
      <thead>
        <tr>
          <th className="w-[52%] sm:w-[32%]">Person</th>
          <th className="sm:w-[30%]">Driven by</th>
          <th className="hidden w-[15%] sm:table-cell">Status</th>
          <th className="hidden sm:table-cell">Last action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const person = personOf(r.email);
          const account = anonymous ? null : accountText(r.accountId, r.account);
          return (
            <tr
              key={r.id}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) return;
                router.push(`/sessions/${r.id}`);
              }}
              className={`link ${fresh.has(r.id) ? "row-new" : ""}`}
            >
              <td>
                <div className="flex min-w-0 items-center gap-2">
                  {r.live && <span className="live sm" title="Live" />}
                  <Link href={`/sessions/${r.id}`} className="min-w-0 truncate font-medium hover:underline">
                    {person.label}
                    {person.device && <span className="ml-1.5 font-mono text-[12px] font-normal text-ink-3">{person.device}</span>}
                  </Link>
                </div>
                <div className={`mt-0.5 truncate text-[12px] text-ink-3 ${r.live ? "pl-[14px]" : ""}`}>
                  {account}
                  {r.handoffAt !== null && (
                    <>
                      {account ? " · " : ""}agent took over <LocalTime t={r.handoffAt} format="clock" initial={clock(r.handoffAt)} />
                    </>
                  )}
                  {!account && r.handoffAt === null && <span suppressHydrationWarning>started {ago(r.startedAt, now)}</span>}
                  {markSensor && r.source === "sensor" && <span className="ml-1.5 rounded-full bg-track px-1.5 py-px font-mono text-[10.5px] text-ink-2">sensor</span>}
                </div>
              </td>
              <td>
                <Who verdict={r.verdict}>{r.verdict === "agent" ? (r.driver ?? "Unknown automation") : undefined}</Who>
                <div className="mt-0.5 truncate pl-[15px] text-[12px] text-ink-3">
                  {r.verdict === "unknown"
                    ? "Not enough evidence yet"
                    : r.verdict === "human"
                      ? `${Math.round(r.confidence * 100)}% sure`
                      : `${r.tier === "unknown-automation" ? "Automated" : TIER_LABEL[r.tier]} · ${Math.round(r.confidence * 100)}%`}
                </div>
                {r.verdict === "agent" && (
                  <div className="mt-1.5 pl-[15px] sm:hidden">
                    <StatusPill verdict={r.verdict} outcome={r.outcome} />
                  </div>
                )}
              </td>
              <td className="hidden sm:table-cell">
                <StatusPill verdict={r.verdict} outcome={r.outcome} />
              </td>
              <td className="hidden sm:table-cell">
                <div className="truncate">{r.last?.action ?? <span className="font-mono text-[12.5px] text-ink-2">{r.last?.route ?? "/"}</span>}</div>
                <div className="mt-0.5 text-[12px] text-ink-3" suppressHydrationWarning>
                  {r.live ? ago(r.lastAt, now) : `ended ${ago(r.lastAt, now)}`}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
