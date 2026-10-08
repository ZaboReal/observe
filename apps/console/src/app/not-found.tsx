import Link from "next/link";

import { Page, buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <Page>
      <div className="py-24 text-center">
        <div className="eyebrow">404</div>
        <h1 className="mt-3 text-[30px] leading-tight font-medium tracking-[-0.035em]">
          Nothing <em>here</em>
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[14px] text-ink-2">This session may be older than the 7 days the console keeps, or the link is wrong.</p>
        <Link href="/sessions" className={`${buttonClass("dark", "md")} mt-6`}>
          Back to sessions
        </Link>
      </div>
    </Page>
  );
}
