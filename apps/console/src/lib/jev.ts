import "server-only";

import type { Questions } from "./jev-questions";

/**
 * Minimal client for TypeSafe's Jev (`POST /v1/systemone`). Server-side only: the key comes from
 * `TYPESAFE_API_KEY` and never reaches the browser.
 */

const DEFAULT_BASE_URL = "https://api.typesafe.ai";
const DEFAULT_MODEL = "jev-1.13.0";
const TIMEOUT_MS = 10_000;

export class JevError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "JevError";
  }
}

export function jevConfig() {
  return {
    apiKey: process.env.TYPESAFE_API_KEY || null,
    baseUrl: (process.env.TYPESAFE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.JEV_MODEL || DEFAULT_MODEL,
  };
}

export function jevConfigured(): boolean {
  return Boolean(jevConfig().apiKey);
}

export interface SystemOneResult {
  raw: unknown;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
}

async function post(url: string, apiKey: string, body: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

/** Ask Jev the given questions about `state`. Retries once on rate limits and server errors. */
export async function systemOne(state: unknown, questions: Questions): Promise<SystemOneResult> {
  const { apiKey, baseUrl, model } = jevConfig();
  if (!apiKey) throw new JevError("TYPESAFE_API_KEY is not set");
  const url = `${baseUrl}/v1/systemone`;
  const body = JSON.stringify({ model, state, questions });
  const started = Date.now();

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await post(url, apiKey, body);
    } catch (e) {
      if (attempt === 1) throw new JevError(e instanceof Error ? e.message : "Jev request failed");
      continue;
    }
    if (res.ok || (res.status !== 429 && res.status < 500)) break;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
  }
  if (!res) throw new JevError("Jev request failed");
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new JevError(`Jev returned ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
  }

  const raw: unknown = await res.json();
  const r = raw as { model?: unknown; usage?: { input_tokens?: unknown } };
  return {
    raw,
    model: typeof r.model === "string" ? r.model : model,
    latencyMs: Date.now() - started,
    inputTokens: typeof r.usage?.input_tokens === "number" ? r.usage.input_tokens : null,
  };
}
