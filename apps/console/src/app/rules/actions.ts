"use server";

import { revalidatePath } from "next/cache";

import { currentSite } from "@/lib/current-site";
import { dbWritable, setPrice, setRate } from "@/lib/db";
import { parsePrice, priceFor, rateFor, setLocalPrice, setLocalRate, type RateUnit } from "@/lib/pricing";
import { syncStore } from "@/lib/sync";

export interface PricingState {
  error: string | null;
  saved: number | null;
}

const ACTION_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * Save the billing panel: `rate:hour` and `rate:session`, one `price:<action id>` field per action, and an optional
 * new action (`new_action`, `new_price`). Only changed prices are written. An empty box removes the charge.
 */
export async function savePricesAction(_prev: PricingState, form: FormData): Promise<PricingState> {
  const site = await currentSite();
  if (!site.stored || !dbWritable) return { error: "Prices can only be set on the deployed console, for sites added there.", saved: null };

  const rates = new Map<RateUnit, number | null>();
  for (const unit of ["hour", "session"] as const) {
    const value = form.get(`rate:${unit}`);
    if (typeof value !== "string") continue;
    const micro = parsePrice(value);
    if (micro === undefined) return { error: `“${value}” is not a price. Use dollars, like 2 or 0.10, up to $100.`, saved: null };
    rates.set(unit, micro);
  }

  const wanted = new Map<string, number | null>();
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("price:") || typeof value !== "string") continue;
    const id = key.slice("price:".length);
    if (!ACTION_ID.test(id)) continue;
    const micro = parsePrice(value);
    if (micro === undefined) return { error: `“${value}” is not a price. Use dollars, like 0.25 or 0.002, up to $100.`, saved: null };
    wanted.set(id, micro);
  }
  const newId = String(form.get("new_action") ?? "").trim();
  const newPrice = String(form.get("new_price") ?? "").trim();
  if (newId || newPrice) {
    if (!ACTION_ID.test(newId)) return { error: "Action ids are 1-64 letters, digits, _ . : or -, as your server passes them to observe.check().", saved: null };
    const micro = parsePrice(newPrice);
    if (!micro) return { error: "Give the new action a price, like 0.25.", saved: null };
    wanted.set(newId, micro);
  }

  let saved = 0;
  try {
    for (const [unit, micro] of rates) {
      if ((rateFor(site.id, unit) ?? null) === micro) continue;
      await setRate(site.id, unit, micro);
      setLocalRate(site.id, unit, micro);
      saved++;
    }
    for (const [id, micro] of wanted) {
      if ((priceFor(site.id, id) ?? null) === micro) continue;
      await setPrice(site.id, id, micro);
      setLocalPrice(site.id, id, micro);
      saved++;
    }
  } catch (e) {
    return { error: `Could not save prices: ${e instanceof Error ? e.message : String(e)}`, saved: null };
  }
  await syncStore(true);
  revalidatePath("/rules");
  return { error: null, saved };
}
