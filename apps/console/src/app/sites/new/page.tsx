import type { Metadata } from "next";

import { Page, PageHeader } from "@/components/ui";
import { dbWritable } from "@/lib/db";
import { consoleOrigin, sensorManifest } from "@/lib/origin";

import { NewSiteForm } from "./form";

export const metadata: Metadata = { title: "Add a site" };
export const dynamic = "force-dynamic";

export default async function NewSitePage() {
  const origin = await consoleOrigin();
  return (
    <Page>
      <PageHeader
        eyebrow="Sites"
        title={
          <>
            Add a site <em>to watch</em>
          </>
        }
        description="You get a publishable key for the page, a secret key for your server, and a prompt your coding agent can install it with."
      />
      <NewSiteForm console={origin} sensor={await sensorManifest(origin)} enabled={dbWritable} />
    </Page>
  );
}
