import type { Metadata } from "next";
import { Observe } from "@observe/next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Acme Invoices",
  description: "A demo shop with Observe installed through @observe/next.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Observe
          protect={[
            { path: "/api/invoices/export", method: "POST", action: "export_invoices" },
            // Server actions post to the page they are on.
            { path: "/", method: "POST", action: "invite_teammate" },
          ]}
        />
      </body>
    </html>
  );
}
