"use client";

import { useState, useTransition } from "react";

import { rotateSecretAction } from "@/app/sites/actions";

import { CopyButton } from "./code";

/** Replace the site's secret key and show the new one once. */
export function RotateSecret({ siteId }: { siteId: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ error: string | null; secretKey: string | null } | null>(null);

  if (result?.secretKey) {
    return (
      <div className="mt-2.5 rounded-xl bg-amber-soft px-3 py-2.5 text-ink">
        <div className="text-[12.5px] font-medium">New secret key: copy it now, it won&apos;t be shown again</div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[12px]">{result.secretKey}</span>
          <CopyButton text={result.secretKey} label="Copy secret key" />
        </div>
        <div className="mt-1 text-[12px] text-ink-2">The old key stopped working. Update OBSERVE_SECRET_KEY on your server.</div>
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      {confirming ? (
        <span className="flex flex-wrap items-center gap-2 text-[12.5px]">
          The old key stops working at once.
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => setResult(await rotateSecretAction(siteId)))}
            className="rounded-full bg-red-soft px-3 py-1 font-medium text-red disabled:opacity-60"
          >
            {pending ? "Rotating…" : "Rotate now"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-2 py-1 text-ink-3 hover:text-ink">
            Cancel
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="rounded-full px-3 py-1 text-[12.5px] font-medium shadow-ring hover:bg-ink/[0.04]">
          Rotate secret key
        </button>
      )}
      {result?.error && <p className="mt-1.5 text-[12px] text-red">{result.error}</p>}
    </div>
  );
}
