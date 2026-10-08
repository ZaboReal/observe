import { describe, expect, it } from "vitest";

import { checkToken, issueToken, TOKEN_TTL_MS } from "../src/lib/token";

describe("session tokens", () => {
  it("round-trips for the same site", async () => {
    const { token, exp } = await issueToken("s_abc", "arzach", 1_000);
    expect(exp).toBe(1_000 + TOKEN_TTL_MS);
    expect(await checkToken(token, "arzach", 2_000)).toEqual({ status: "valid", payload: { s: "s_abc", k: "arzach", e: exp } });
  });

  it("is useless on another site", async () => {
    const { token } = await issueToken("s_abc", "arzach", 1_000);
    expect((await checkToken(token, "other", 2_000)).status).toBe("invalid");
  });

  it("expires", async () => {
    const { token } = await issueToken("s_abc", "arzach", 1_000);
    expect((await checkToken(token, "arzach", 1_000 + TOKEN_TTL_MS)).status).toBe("expired");
  });

  it("rejects tampering and junk", async () => {
    const { token } = await issueToken("s_abc", "arzach", 1_000);
    const [v, payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ s: "s_other", k: "arzach", e: 9e15 })).toString("base64url");
    expect((await checkToken(`${v}.${forged}.${mac}`, "arzach", 2_000)).status).toBe("invalid");
    expect((await checkToken(`${v}.${payload}.${mac}x`, "arzach", 2_000)).status).toBe("invalid");
    expect((await checkToken("v2.a.b", "arzach", 2_000)).status).toBe("invalid");
    expect((await checkToken("", "arzach", 2_000)).status).toBe("missing");
    expect((await checkToken(undefined, "arzach", 2_000)).status).toBe("missing");
  });
});
