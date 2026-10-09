"use client";

import { useActionState } from "react";

import { buttonClass } from "@/components/ui";
import { formatMinutes, formatPrice, formatTotal, MICRO } from "@/lib/money";
import type { PriceReach, PricingRow } from "@/lib/pricing-view";

import { savePricesAction } from "./actions";

const REACH: Record<PriceReach, string> = {
  agents: "Recognised and verified agents",
  verified: "Verified agents only; others ask the person",
  never: "A person must approve this, so it is never sold",
};

const field = "h-9 w-full rounded-full border-0 bg-sheet font-mono text-[13px] shadow-ring outline-none placeholder:text-ink-3 focus:shadow-[0_0_0_2px_var(--color-ink)]";
const box = `${field} pr-3 pl-6 text-right tabular`;

/** Dollars as typed in a price box: whole cents as 2.00 or 0.10, smaller amounts as 0.002. */
function dollars(micro: number | null): string {
  if (!micro) return "";
  return micro % 10_000 === 0 ? (micro / MICRO).toFixed(2) : String(Number((micro / MICRO).toFixed(6)));
}

const ROW = "grid grid-cols-[minmax(0,1fr)_112px] items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 lg:grid-cols-[minmax(0,1fr)_200px_128px]";
const STATS = "col-span-2 row-start-2 text-[12px] text-ink-3 lg:col-span-1 lg:row-start-auto lg:text-right";
const BOX_CELL = "relative col-start-2 row-start-1 lg:col-start-auto lg:row-start-auto";

function PriceBox({ name, value, label, editable }: { name: string; value: number | null; label: string; editable: boolean }) {
  return (
    <label className={BOX_CELL}>
      <span className="sr-only">{label}</span>
      {editable ? (
        <>
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[13px] text-ink-3">$</span>
          <input name={name} defaultValue={dollars(value)} placeholder="No charge" inputMode="decimal" autoComplete="off" className={box} />
        </>
      ) : (
        <span className={`block text-right font-mono text-[13px] tabular ${value ? "text-ink" : "text-ink-3"}`}>{value ? formatPrice(value) : "No charge"}</span>
      )}
    </label>
  );
}

export interface BillingTotals {
  time: number;
  minutes: number;
  sessions: number;
  sessionCount: number;
}

export function PricingForm({
  rows,
  rates,
  billing,
  editable,
  note,
}: {
  rows: PricingRow[];
  rates: { hour: number | null; session: number | null };
  billing: BillingTotals;
  editable: boolean;
  note: string | null;
}) {
  const [state, action, pending] = useActionState(savePricesAction, { error: null, saved: null });

  return (
    <form action={action}>
      <div className="eyebrow border-t border-line bg-tile px-4 py-2">By time</div>
      <div className={ROW}>
        <div className="min-w-0">
          <div className="text-[14px]">Per hour of agent time</div>
          <div className="text-[12px] leading-[1.45] text-ink-3">Charged by the minute while a recognised or verified agent drives</div>
        </div>
        <div className={STATS}>
          {billing.minutes ? `${formatMinutes(billing.minutes)} this week` : "No agent time this week"}
          {billing.time > 0 && <span className="block font-medium text-green">{formatTotal(billing.time)} billed</span>}
        </div>
        <PriceBox name="rate:hour" value={rates.hour} label="Price per hour of agent time" editable={editable} />
      </div>
      <div className={ROW}>
        <div className="min-w-0">
          <div className="text-[14px]">Per agent session</div>
          <div className="text-[12px] leading-[1.45] text-ink-3">Once for each session a recognised or verified agent drives</div>
        </div>
        <div className={STATS}>
          {billing.sessionCount ? `${billing.sessionCount.toLocaleString("en-US")} ${billing.sessionCount === 1 ? "session" : "sessions"} this week` : "No billed sessions this week"}
          {billing.sessions > 0 && <span className="block font-medium text-green">{formatTotal(billing.sessions)} billed</span>}
        </div>
        <PriceBox name="rate:session" value={rates.session} label="Price per agent session" editable={editable} />
      </div>

      <div className="eyebrow border-t border-line bg-tile px-4 py-2">Per action</div>
      {rows.length === 0 ? (
        <p className="border-t border-line px-4 py-3 text-[13px] leading-[1.55] text-ink-2">
          No actions on this site yet. They appear once the sensor or your server reports one (<span className="font-mono text-[12px]">observe.check(&quot;export_invoices&quot;)</span>), or price one
          below before it happens.
        </p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className={ROW}>
              <div className="min-w-0">
                <div className="truncate text-[14px]">{r.label}</div>
                <div className="text-[12px] leading-[1.45] text-ink-3">
                  <span className="font-mono text-[11.5px] break-all">{r.id}</span> · {REACH[r.reach]}
                </div>
              </div>
              <div className={STATS}>
                {r.agentActions ? (
                  <>
                    {r.agentActions.toLocaleString("en-US")} by agents this week
                    {r.billed > 0 && <span className="block font-medium text-green">{formatTotal(r.billed)} billed</span>}
                  </>
                ) : (
                  "None by agents this week"
                )}
              </div>
              {r.reach === "never" ? (
                <span className={`${BOX_CELL} block text-right font-mono text-[13px] text-ink-3`}>—</span>
              ) : (
                <PriceBox name={`price:${r.id}`} value={r.price} label={`Price per action for ${r.label}`} editable={editable} />
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className={ROW}>
          <label className="min-w-0">
            <span className="sr-only">Action id to price</span>
            <input name="new_action" placeholder="Price another action: its id, e.g. export_invoices" autoComplete="off" className={`${field} px-4 text-[12.5px]`} />
          </label>
          <span className="hidden lg:block" />
          <label className="relative">
            <span className="sr-only">Price for the new action</span>
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[13px] text-ink-3">$</span>
            <input name="new_price" placeholder="0.25" inputMode="decimal" autoComplete="off" className={box} />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        <p className="text-[12.5px] text-ink-3">
          {state.error ? (
            <span className="text-red">{state.error}</span>
          ) : state.saved !== null ? (
            <span className="text-green">{state.saved === 0 ? "Nothing changed." : `Saved ${state.saved} ${state.saved === 1 ? "price" : "prices"}.`}</span>
          ) : (
            (note ?? "In US dollars. Leave a box empty for no charge.")
          )}
        </p>
        {editable && (
          <button type="submit" disabled={pending} className={`${buttonClass("dark")} disabled:opacity-60`}>
            {pending ? "Saving…" : "Save prices"}
          </button>
        )}
      </div>
    </form>
  );
}
