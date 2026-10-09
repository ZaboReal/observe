"use server";

import { revalidatePath } from "next/cache";

import { setLocalAgentRule } from "@/lib/agent-rules";
import { currentSite } from "@/lib/current-site";
import { dbWritable, setAgentRule } from "@/lib/db";
import { syncStore } from "@/lib/sync";
import { ruleChange } from "@/lib/views";

export interface RuleResult {
  error: string | null;
}

/**
 * Set what an agent (a driver id) or a kind of agent (`any-verified`, `any-recognised`, `unnamed`) may do with one
 * scope on the current site, from the Rules page. A null choice removes the rule, and so does choosing what would apply
 * anyway. Limits the site sets for every agent cannot be changed.
 */
export async function setAgentRuleAction(subject: string, scope: string, choice: string | null): Promise<RuleResult> {
  await syncStore();
  const site = await currentSite();
  if (site.demo || !site.stored || !dbWritable) return { error: "Rules can only be changed on the deployed console, for sites added there." };

  // What applies without this rule (its group's rule) must be current, so the sync comes first.
  const change = ruleChange(site.id, String(subject), String(scope), choice === null ? null : String(choice));
  if (change.error !== null) return { error: change.error };

  try {
    await setAgentRule(site.id, subject, change.scope, change.choice);
    setLocalAgentRule(site.id, subject, change.scope, change.choice);
  } catch (e) {
    return { error: `Could not save the rule: ${e instanceof Error ? e.message : String(e)}` };
  }
  await syncStore(true);
  revalidatePath("/rules");
  return { error: null };
}
