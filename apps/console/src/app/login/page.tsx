import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LogoMark } from "@/components/logo";
import { authEnabled } from "@/lib/auth";
import { DEFAULT_SITE as SITE } from "@/lib/site";

import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!authEnabled()) redirect("/");
  const next = (await searchParams).next;
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-bg px-4 py-16">
      {/* The site's soft wash of colour behind the headline. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[38%] left-1/2 h-[520px] w-[900px] max-w-[200vw] -translate-x-1/2 -translate-y-1/2 blur-[20px]"
        style={{
          background: "radial-gradient(closest-side at 35% 55%, rgba(28,122,94,0.12), transparent), radial-gradient(closest-side at 68% 45%, rgba(70,110,220,0.1), transparent)",
        }}
      />
      <div className="relative w-full max-w-[380px] text-center">
        <LogoMark size={72} className="mx-auto" />
        <h1 className="mt-7 text-[34px] leading-[1.05] font-medium tracking-[-0.04em]">
          Know who&apos;s driving <em>{SITE.host}</em>
        </h1>
        <p className="mt-3 text-[15px] text-ink-2">Sign in to the {SITE.name} console.</p>
        <LoginForm next={typeof next === "string" ? next : "/"} />
        <p className="mt-6 text-[12.5px] text-ink-3">Reads behaviour, never content.</p>
      </div>
    </div>
  );
}
