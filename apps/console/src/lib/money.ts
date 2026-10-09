/** Agent prices as money: millionths of a dollar, so per-request prices like $0.002 are exact. Safe in the browser. */

export const MICRO = 1_000_000;
/** The most one action can cost, as the database allows. */
export const MAX_PRICE_MICRO = 100 * MICRO;

/** $0.002, $0.25, $1.50, $12 */
export function formatPrice(micro: number): string {
  const dollars = micro / MICRO;
  if (dollars >= 10 && Number.isInteger(dollars)) return `$${dollars}`;
  if (dollars >= 0.01) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toFixed(4).replace(/0+$/, "")}`;
}

/** A total over many actions: cents shown, small amounts kept readable. */
export function formatTotal(micro: number): string {
  const dollars = micro / MICRO;
  if (dollars > 0 && dollars < 0.01) return formatPrice(micro);
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse what someone typed into a price box ("0.25", "$1", ".002"). Null for empty or zero; undefined if invalid. */
export function parsePrice(text: string): number | null | undefined {
  const t = text.trim().replace(/^\$/, "");
  if (!t) return null;
  if (!/^\d*\.?\d+$/.test(t)) return undefined;
  const micro = Math.round(Number(t) * MICRO);
  if (!Number.isFinite(micro) || micro > MAX_PRICE_MICRO) return undefined;
  return micro > 0 ? micro : null;
}
