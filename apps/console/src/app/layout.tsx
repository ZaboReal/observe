import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { MobileNav, Sidebar } from "@/components/nav";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Observe", template: "%s · Observe" },
  description: "See which AI agents act inside your product, for whom, and what they do.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="min-w-0 flex-1">
            <MobileNav />
            <main>{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
