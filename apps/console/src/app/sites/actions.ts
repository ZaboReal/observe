"use server";

import { cookies } from "next/headers";

import { SITE_COOKIE } from "@/lib/current-site";
import { createSite, dbWritable, setSecretHash } from "@/lib/db";
import { allSites, sha256Hex, siteById } from "@/lib/site";
import { syncStore } from "@/lib/sync";

/**
 * Sites and their keys (docs/install.md). The secret key is shown once, here, and only its SHA-256 is stored, as
 * Stripe and the bot-detection vendors do with server keys.
 */

const hex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

export interface CreatedSite {
  id: string;
  name: string;
  host: string;
  publishableKey: string;
  secretKey: string;
}

function hostOf(value: string): string | null {
  const raw = value.trim().toLowerCase();
  try {
    const host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
    return /^[a-z0-9.-]{1,253}$/.test(host) && host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

export interface CreateState {
  error: string | null;
  created: CreatedSite | null;
}

export async function createSiteAction(_prev: CreateState, form: FormData): Promise<CreateState> {
  if (!dbWritable) return { error: "Adding sites needs the console's database (set SUPABASE_URL, SUPABASE_KEY and OBSERVE_DB_TOKEN).", created: null };
  const host = hostOf(String(form.get("host") ?? ""));
  if (!host) return { error: "Enter the site's domain, like app.example.com.", created: null };
  const name = String(form.get("name") ?? "").trim().slice(0, 80) || host;
  const anonymous = form.get("signin") !== "yes";

  await syncStore(true);
  const base = host.replace(/^www\./, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "site";
  let id = base;
  for (let n = 2; siteById(id); n++) id = `${base}-${n}`;

  const publishableKey = `pk_${id}_${hex(8)}`;
  const secretKey = `sk_${id}_${hex(16)}`;
  try {
    await createSite({ id, name, host, environment: "Production", anonymous, publishable_key: publishableKey, secret_key_hash: await sha256Hex(secretKey) });
  } catch (e) {
    return { error: `Could not create the site: ${e instanceof Error ? e.message : String(e)}`, created: null };
  }
  await syncStore(true);
  (await cookies()).set(SITE_COOKIE, id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 86_400 });
  return { error: null, created: { id, name, host, publishableKey, secretKey } };
}

/** Replace a site's secret key. The old one stops working at once. */
export async function rotateSecretAction(siteId: string): Promise<{ error: string | null; secretKey: string | null }> {
  if (!dbWritable) return { error: "Keys can only be changed on the deployed console.", secretKey: null };
  await syncStore(true);
  const site = allSites().find((s) => s.id === siteId);
  if (!site?.stored) return { error: "This site has no secret key to rotate.", secretKey: null };
  const secretKey = `sk_${site.id}_${hex(16)}`;
  try {
    await setSecretHash(site.id, await sha256Hex(secretKey));
  } catch (e) {
    return { error: `Could not rotate the key: ${e instanceof Error ? e.message : String(e)}`, secretKey: null };
  }
  await syncStore(true);
  return { error: null, secretKey };
}
