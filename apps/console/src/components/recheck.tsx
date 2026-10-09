"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { recheckSession } from "@/app/sessions/[id]/actions";

/** Asks the model to look at the session again, for example after the console's evidence improved. */
export function Recheck({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await recheckSession(sessionId);
            setError(r.error);
            router.refresh();
          })
        }
        className="rounded-full px-2.5 py-0.5 text-[12px] font-medium shadow-ring transition-colors hover:bg-ink/[0.04] disabled:opacity-60"
      >
        {pending ? "Checking…" : "Check again"}
      </button>
      {error && <span className="text-[12px] text-red">{error}</span>}
    </span>
  );
}
