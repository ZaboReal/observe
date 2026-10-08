import { redirect } from "next/navigation";

import { syncStore } from "@/lib/sync";

export const dynamic = "force-dynamic";

/** The old address of the activity log. Keeps its filters. */
export default async function LogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await syncStore();
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") next.set(k, v);
    else if (Array.isArray(v)) for (const x of v) next.append(k, x);
  }
  const qs = next.toString();
  redirect(qs ? `/activity?${qs}` : "/activity");
}
