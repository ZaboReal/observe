/**
 * Show Observe's answer next to each protected action (the default, for trying the integration). Set
 * NEXT_PUBLIC_OBSERVE_SHOW_DECISIONS=0 to run the shop as a plain app, as a customer's users would see it.
 */
export const SHOW_DECISIONS = process.env.NEXT_PUBLIC_OBSERVE_SHOW_DECISIONS !== "0";
