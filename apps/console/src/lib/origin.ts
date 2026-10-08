import "server-only";

import { headers } from "next/headers";

/** This console's own origin, as the request reached it (behind Vercel, from the forwarded headers). */
export async function consoleOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** The hosted sensor's current version and integrity hash, or null before the first build copied it. */
export async function sensorManifest(origin: string): Promise<{ version: string; integrity: string } | null> {
  try {
    const res = await fetch(`${origin}/sensor/manifest.json`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(2_000) });
    if (!res.ok) return null;
    const m = (await res.json()) as { version?: unknown; integrity?: unknown };
    return typeof m.version === "string" && typeof m.integrity === "string" ? { version: m.version, integrity: m.integrity } : null;
  } catch {
    return null;
  }
}
