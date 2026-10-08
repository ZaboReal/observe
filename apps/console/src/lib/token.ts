/**
 * Session tokens (docs/install.md): the collector hands the sensor a short-lived signed token naming the session
 * and site; the page attaches it to protected requests; the customer's server passes it to /api/v1/decide, which
 * checks the signature. The browser's own verdict is never trusted, and a token from one site is useless on another.
 *
 * Format: `v1.<base64url(JSON {s, k, e})>.<base64url(HMAC-SHA256(secret, "v1." + payload))>`.
 * Web Crypto only, so it runs in any runtime.
 */

export const TOKEN_TTL_MS = 30 * 60_000;

export interface TokenPayload {
  /** Session id. */
  s: string;
  /** Site id. */
  k: string;
  /** Expiry, ms since epoch. */
  e: number;
}

export type TokenCheck = { status: "valid"; payload: TokenPayload } | { status: "missing" | "invalid" | "expired" };

const enc = new TextEncoder();
const dec = new TextDecoder();

function secret(): string {
  const s = process.env.OBSERVE_TOKEN_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("OBSERVE_TOKEN_SECRET is not set");
  return "observe-development-token-secret";
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let keyPromise: Promise<CryptoKey> | null = null;
function key(): Promise<CryptoKey> {
  return (keyPromise ??= crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));
}

export async function issueToken(sessionId: string, siteId: string, now = Date.now()): Promise<{ token: string; exp: number }> {
  const exp = now + TOKEN_TTL_MS;
  const body = `v1.${b64url(enc.encode(JSON.stringify({ s: sessionId, k: siteId, e: exp } satisfies TokenPayload)))}`;
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)));
  return { token: `${body}.${b64url(mac)}`, exp };
}

/** Check a token's signature, expiry and site. */
export async function checkToken(token: unknown, siteId: string, now = Date.now()): Promise<TokenCheck> {
  if (typeof token !== "string" || !token) return { status: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || token.length > 1_000) return { status: "invalid" };
  let payload: TokenPayload;
  try {
    // verify() compares in constant time.
    const ok = await crypto.subtle.verify("HMAC", await key(), fromB64url(parts[2]!), enc.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return { status: "invalid" };
    payload = JSON.parse(dec.decode(fromB64url(parts[1]!))) as TokenPayload;
  } catch {
    return { status: "invalid" };
  }
  if (typeof payload.s !== "string" || typeof payload.k !== "string" || typeof payload.e !== "number") return { status: "invalid" };
  if (payload.k !== siteId) return { status: "invalid" };
  if (payload.e <= now) return { status: "expired" };
  return { status: "valid", payload };
}
