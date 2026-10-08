"use client";

import Link from "next/link";
import { useActionState } from "react";

import { CodeBlock, CopyButton } from "@/components/code";
import { Panel, buttonClass } from "@/components/ui";
import { agentPrompt } from "@/lib/install";

import { createSiteAction } from "../actions";

const field = "h-11 w-full rounded-full border-0 bg-sheet px-4 text-[14.5px] shadow-ring outline-none focus:shadow-[0_0_0_2px_var(--color-ink)]";

export function NewSiteForm({ console: origin, sensor, enabled }: { console: string; sensor: { version: string; integrity: string } | null; enabled: boolean }) {
  const [state, action, pending] = useActionState(createSiteAction, { error: null, created: null });
  const created = state.created;

  if (created) {
    const target = { console: origin, publishableKey: created.publishableKey, host: created.host, sensor };
    return (
      <div className="grid max-w-[760px] gap-3">
        <Panel title={`${created.name} is ready`} description="Copy the secret key now: it is shown once, and we keep only a hash of it.">
          <dl className="grid gap-3">
            <div>
              <dt className="eyebrow">Secret key · server only, as OBSERVE_SECRET_KEY</dt>
              <dd className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-amber-soft px-3 py-2">
                <span className="truncate font-mono text-[12.5px]">{created.secretKey}</span>
                <CopyButton text={created.secretKey} label="Copy secret key" />
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Publishable key · goes in the page</dt>
              <dd className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-tile px-3 py-2 shadow-ring">
                <span className="truncate font-mono text-[12.5px]">{created.publishableKey}</span>
                <CopyButton text={created.publishableKey} label="Copy publishable key" />
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Install it with your coding agent" description="Paste this into Claude Code, Cursor or any coding agent working in the site's repo. It opens a pull request for you to review.">
          <CodeBlock lang="prompt" code={agentPrompt(target)} />
        </Panel>
        <div>
          <Link href="/setup" className={buttonClass("dark", "md")}>
            Setup and manual steps
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="grid max-w-[520px] gap-4">
      {!enabled && <p className="rounded-xl bg-amber-soft px-4 py-3 text-[13.5px] text-ink">Sites can only be added on the deployed console, which has the database.</p>}
      <label className="grid gap-1.5">
        <span className="text-[13.5px] font-medium">Domain</span>
        <input name="host" required placeholder="app.example.com" autoComplete="off" className={field} disabled={!enabled} />
      </label>
      <label className="grid gap-1.5">
        <span className="text-[13.5px] font-medium">Name</span>
        <input name="name" placeholder="Example" autoComplete="off" className={field} disabled={!enabled} />
      </label>
      <label className="flex items-start gap-2.5 text-[13.5px] text-ink-2">
        <input type="checkbox" name="signin" value="yes" className="mt-0.5 size-4 accent-[var(--color-green)]" disabled={!enabled} />
        <span>
          People sign in to this site
          <span className="block text-[12.5px] text-ink-3">Then sessions can be grouped by person and account. Leave it off for marketing sites.</span>
        </span>
      </label>
      {state.error && <p className="text-[13px] text-red">{state.error}</p>}
      <div>
        <button type="submit" disabled={pending || !enabled} className={`${buttonClass("dark", "md")} disabled:opacity-60`}>
          {pending ? "Creating…" : "Create site and keys"}
        </button>
      </div>
    </form>
  );
}
