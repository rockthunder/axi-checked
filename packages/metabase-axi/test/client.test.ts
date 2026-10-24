import { describe, it, expect, vi, afterEach } from "vitest";
import { MetabaseClient } from "../src/metabase/client.js";

afterEach(() => vi.unstubAllGlobals());

function res(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("MetabaseClient", () => {
  it("sends X-API-Key for api-key auth", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return res(200, { ok: true });
      }),
    );
    const c = new MetabaseClient({
      baseUrl: "https://h",
      auth: { scheme: "api_key", apiKey: "K" },
    });
    expect(await c.get("/api/x")).toEqual({ ok: true });
    expect((calls[0].init.headers as Record<string, string>)["X-API-Key"]).toBe("K");
  });

  it("logs in for session auth, then re-auths once on 401", async () => {
    let sessionCalls = 0;
    let getCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith("/api/session")) {
          sessionCalls++;
          return res(200, { id: `tok${sessionCalls}` });
        }
        getCalls++;
        if (getCalls === 1) return res(401, { message: "expired" });
        const headers = init.headers as Record<string, string>;
        return res(200, { ok: true, token: headers["X-Metabase-Session"] });
      }),
    );
    const c = new MetabaseClient({
      baseUrl: "https://h",
      auth: { scheme: "session", username: "u", password: "p" },
    });
    const out = (await c.get("/api/x")) as { ok: boolean; token: string };
    expect(out.ok).toBe(true);
    expect(sessionCalls).toBe(2); // initial login + one transparent re-auth
    expect(out.token).toBe("tok2");
  });

  it("persists a fresh token via onSession", async () => {
    let saved: { token: string } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/api/session") ? res(200, { id: "tokX" }) : res(200, { ok: true }),
      ),
    );
    const c = new MetabaseClient({
      baseUrl: "https://h",
      auth: { scheme: "session", username: "u", password: "p" },
      onSession: (t) => {
        saved = t;
      },
    });
    await c.get("/api/x");
    expect(saved?.token).toBe("tokX");
  });

  it("maps 404 → NOT_FOUND and network errors → UNREACHABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(404, { message: "nope" })),
    );
    const c1 = new MetabaseClient({
      baseUrl: "https://h",
      auth: { scheme: "api_key", apiKey: "K" },
    });
    await expect(c1.get("/api/x")).rejects.toMatchObject({ code: "NOT_FOUND" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const c2 = new MetabaseClient({
      baseUrl: "https://h",
      auth: { scheme: "api_key", apiKey: "K" },
    });
    await expect(c2.get("/api/x")).rejects.toMatchObject({ code: "UNREACHABLE" });
  });
});
