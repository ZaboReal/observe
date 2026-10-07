import Link from "next/link";

import { Page } from "@/components/ui";

export default function NotFound() {
  return (
    <Page>
      <div className="py-24 text-center">
        <div className="font-mono text-[12px] text-ink-4">404</div>
        <h1 className="mt-2 text-[20px] font-semibold tracking-[-0.02em]">Nothing here</h1>
        <p className="mt-1 text-[13.5px] text-ink-3">This session may be older than the 7 days the console keeps, or the link is wrong.</p>
        <Link href="/sessions" className="mt-5 inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[13px] font-medium text-canvas">
          Back to sessions
        </Link>
      </div>
    </Page>
  );
}
