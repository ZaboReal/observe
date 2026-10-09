"use server";

import { classifyIfDue } from "@/lib/classify";
import { currentSite } from "@/lib/current-site";
import { store } from "@/lib/store";
import { syncStore } from "@/lib/sync";

/** Ask the model again about a session, with the evidence as the console builds it now. */
export async function recheckSession(id: string): Promise<{ error: string | null }> {
  await syncStore(true);
  const site = await currentSite();
  const rec = store.sensor.get(id);
  if (!rec || rec.site !== site.id) return { error: "This session isn't one the sensor reported." };
  rec.jevStatus.key = "";
  rec.jevStatus.at = 0;
  rec.jevStatus.error = null;
  await classifyIfDue(id);
  return { error: rec.jevStatus.error ? "The model didn't answer; try again in a moment." : null };
}
