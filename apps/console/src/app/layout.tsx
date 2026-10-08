import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Instrument_Serif } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { MobileNav, Sidebar, type SiteInfo } from "@/components/nav";
import { SESSION_COOKIE, validSession } from "@/lib/auth";
import { currentSite } from "@/lib/current-site";
import { allSites, type Site } from "@/lib/site";
import { syncStore } from "@/lib/sync";
import { liveNow } from "@/lib/views";

import "./globals.css";

/** The site's accent face: italic serif for a word or two in headings. */
const serif = Instrument_Serif({ weight: "400", style: ["italic"], subsets: ["latin"], variable: "--font-instrument-serif", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const site = await currentSite();
  return {
    title: { default: `Observe · ${site.name}`, template: `%s · Observe` },
    description: "See which AI agents act inside your product, for whom, and what they do.",
  };
}

const choice = (s: Site) => ({ id: s.id, name: s.name, host: s.host, tag: s.demo ? "Demo" : s.environment });

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The live count is only for people signed in to the console (the sign-in page renders this layout too).
  const signedIn = await validSession((await cookies()).get(SESSION_COOKIE)?.value);
  const current = await currentSite();
  if (signedIn) await syncStore();
  const live = signedIn ? liveNow(current.id).sessions : null;
  // Read on the server: the sites come from the deployment's environment, which the browser never sees.
  const site: SiteInfo = { ...choice(current), live, sites: signedIn ? allSites().map(choice) : [] };

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${serif.variable}`}>
      <body>
        <div className="flex min-h-screen">
          <Sidebar site={site} />
          <div className="min-w-0 flex-1">
            <MobileNav site={site} />
            <main>{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
