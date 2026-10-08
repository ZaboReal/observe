import "server-only";

import { cookies } from "next/headers";

import { DEFAULT_SITE, siteById, type Site } from "./site";

/** Which site the console is showing, chosen with the site menu in the sidebar. */
export const SITE_COOKIE = "observe_site";

export async function currentSite(): Promise<Site> {
  return siteById((await cookies()).get(SITE_COOKIE)?.value) ?? DEFAULT_SITE;
}
