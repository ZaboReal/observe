"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { ago } from "@/lib/format";
import type { SessionRow } from "@/lib/queries";

import { LiveDot, Method, TierTag, VerdictBadge } from "./ui";

export function SessionsTable({ rows, now, compact = false }: { rows: SessionRow[]; now: number; compact?: boolean }) {
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);
  const fresh = seen.current ? new Set(rows.filter((r) => !seen.current!.has(r.id)).map((r) => r.id)) : new Set<string>();

  useEffect(() => {
    seen.current ??= new Set();
    for (const r of rows) seen.current.add(r.id);
  }, [rows]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="border-b border-line text-[12px] text-ink-3">
            <th className="py-2.5 pr-3 pl-5 font-normal">Identity</th>
            <th className="px-3 py-2.5 font-normal">Type</th>
            <th className="px-3 py-2.5 font-normal">Driver</th>
            {!compact && <th className="px-3 py-2.5 text-right font-normal">Confidence</th>}
            <th className="py-2.5 pr-5 pl-3 text-right font-normal">Activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) return;
                router.push(`/sessions/${r.id}`);
              }}
              className={`group cursor-pointer border-b border-line last:border-0 hover:bg-wash ${fresh.has(r.id) ? "row-new" : ""}`}
            >
              <td className="py-3 pr-3 pl-5 align-top">
                <div className="flex items-center gap-2">
                  {r.live && <LiveDot />}
                  <Link href={`/sessions/${r.id}`} className="truncate text-[13.5px] hover:underline">
                    {r.email}
                  </Link>
                </div>
                <div className={`mt-0.5 text-[12px] text-ink-3 ${r.live ? "pl-3.5" : ""}`}>
                  {r.account}
                  {r.source === "sensor" && <span className="ml-1.5 rounded border border-line px-1 text-[10.5px] text-ink-2">sensor</span>}
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <VerdictBadge verdict={r.verdict} />
              </td>
              <td className="px-3 py-3 align-top">
                {r.verdict === "agent" ? (
                  <>
                    <div className="text-[13.5px]">{r.driver ?? "Unnamed automation"}</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <TierTag tier={r.tier} />
                      {r.takeover && <span className="text-[12px] text-ink-3">· took over</span>}
                    </div>
                  </>
                ) : (
                  <span className="text-ink-4">—</span>
                )}
              </td>
              {!compact && (
                <td className="px-3 py-3 text-right align-top text-[13px] text-ink-2 tabular">
                  {r.verdict === "unknown" ? <span className="text-ink-4">—</span> : `${Math.round(r.confidence * 100)}%`}
                </td>
              )}
              <td className="py-3 pr-5 pl-3 text-right align-top">
                <div className="flex items-center justify-end gap-1.5 text-[13px]">
                  {r.last?.path ? (
                    <>
                      <span className="font-mono text-[12.5px] text-ink-3">{r.last.route}</span>
                      <ArrowRight size={12} className="text-ink-4" />
                      <Method method={r.last.method ?? ""} />
                      <span className="max-w-[220px] truncate font-mono text-[12.5px]">{r.last.path}</span>
                    </>
                  ) : (
                    <span className="font-mono text-[12.5px] text-ink-3">{r.last?.route ?? "/"}</span>
                  )}
                </div>
                <div className="mt-0.5 text-[12px] text-ink-3" suppressHydrationWarning>
                  {r.live ? ago(r.lastAt, now) : `ended ${ago(r.lastAt, now)}`}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
