"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SITE_COOKIE } from "@/lib/current-site";
import { siteById } from "@/lib/site";

/** Sections that list a site's data; a page inside one (a session, an agent) belongs to the old site. */
const SECTIONS = ["/sessions", "/agents", "/accounts", "/activity", "/rules", "/setup"];

/** Show another site, staying in the same section of the console. */
export async function chooseSite(siteId: string, pathname: string): Promise<void> {
  if (!siteById(siteId)) return;
  (await cookies()).set(SITE_COOKIE, siteId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 86_400,
  });
  redirect(SECTIONS.find((s) => pathname === s || pathname.startsWith(`${s}/`)) ?? "/");
}
