/**
 * A single shared password for a deployed console (OBSERVE_CONSOLE_PASSWORD). Signing in sets a cookie holding
 * an expiry and an HMAC of it keyed by the password, so changing the password signs everyone out.
 * Without the variable (local development) the console is open.
 *
 * Web Crypto only, so the proxy and server actions can both use it.
 */

export const SESSION_COOKIE = "observe_session";
export const SESSION_DAYS = 30;

const password = () => process.env.OBSERVE_CONSOLE_PASSWORD || null;

export const authEnabled = () => Boolean(password());

const enc = new TextEncoder();

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compare without stopping at the first difference. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(attempt: string): Promise<boolean> {
  const secret = password();
  if (!secret) return true;
  // Compare MACs rather than the strings, so the comparison takes the same time whatever the input's length.
  return same(await sign(attempt, secret), await sign(secret, secret));
}

export async function newSession(now = Date.now()): Promise<string> {
  const expires = String(now + SESSION_DAYS * 86_400_000);
  return `${expires}.${await sign(expires, password() ?? "")}`;
}

export async function validSession(cookie: string | undefined, now = Date.now()): Promise<boolean> {
  const secret = password();
  if (!secret) return true;
  if (!cookie) return false;
  const [expires, mac] = cookie.split(".");
  if (!expires || !mac || !(Number(expires) > now)) return false;
  return same(mac, await sign(expires, secret));
}
