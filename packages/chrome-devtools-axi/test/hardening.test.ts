import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { checkBridgeHealth, stopBridge } from "../src/client.js";
import { resolveSessionPidFile } from "../src/sessions.js";
import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createBridgeServer, isRequestAuthorized, buildTransportArgs, type BridgeClient } from "../src/bridge.js";
import { BRIDGE_TOKEN_HEADER, assertAttachModeAllowed } from "../src/bridge-script.js";

// Hardening added in the corporate build (see SECURITY-REVIEW.md):
//  - the bridge requires a per-run secret on every request
//  - attaching to an existing browser needs an explicit opt-in

const fakeClient: BridgeClient = {
  async listTools() {
    return { tools: [{ name: "list_pages", description: "x" }] };
  },
  async callTool() {
    return { content: [{ type: "text", text: "ok" }] };
  },
  async close() {},
};

function send(
  server: Server,
  { method = "GET", path = "/tools", headers = {} }: { method?: string; path?: string; headers?: Record<string, string> },
): Promise<{ status: number; body: string }> {
  const { port } = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end(method === "POST" ? JSON.stringify({ name: "list_pages", args: {} }) : undefined);
  });
}

describe("bridge request authentication", () => {
  let server: Server;
  const TOKEN = "t".repeat(64);

  beforeEach(async () => {
    server = createBridgeServer(fakeClient, "s", undefined, TOKEN);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("refuses every route without the token, including health, tools and call", async () => {
    for (const probe of [
      { path: "/health" },
      { path: "/tools" },
      { method: "POST", path: "/call" },
    ]) {
      const result = await send(server, probe);
      expect(result.status, JSON.stringify(probe)).toBe(403);
      expect(result.body).toContain("Forbidden");
    }
  });

  it("refuses a wrong or truncated token", async () => {
    for (const token of ["", "x", TOKEN.slice(0, 10), `${TOKEN}extra`, "T".repeat(64)]) {
      const result = await send(server, { headers: { [BRIDGE_TOKEN_HEADER]: token } });
      expect(result.status, token).toBe(403);
    }
  });

  it("refuses a simple cross-origin POST (text/plain, loopback Origin) that carries no token", async () => {
    const result = await send(server, {
      method: "POST",
      path: "/call",
      headers: { "content-type": "text/plain", origin: "http://localhost:3000" },
    });
    expect(result.status).toBe(403);
  });

  it("serves a request that presents the right token", async () => {
    const tools = await send(server, { headers: { [BRIDGE_TOKEN_HEADER]: TOKEN } });
    expect(tools.status).toBe(200);
    expect(tools.body).toContain("list_pages");
    const call = await send(server, { method: "POST", path: "/call", headers: { [BRIDGE_TOKEN_HEADER]: TOKEN } });
    expect(call.status).toBe(200);
  });

  it("still applies the anti-rebinding Host check to authenticated requests", async () => {
    const result = await send(server, { headers: { [BRIDGE_TOKEN_HEADER]: TOKEN, host: "evil.example.com" } });
    expect(result.status).toBe(403);
  });
});

describe("isRequestAuthorized", () => {
  it("is open only when no token is configured (unit-test/legacy callers)", () => {
    const req = { headers: {} } as never;
    expect(isRequestAuthorized(req, undefined)).toBe(true);
    expect(isRequestAuthorized(req, "secret")).toBe(false);
  });
});

describe("attach modes need an explicit opt-in", () => {
  const saved: Record<string, string | undefined> = {};
  const keys = ["CHROME_DEVTOOLS_AXI_AUTO_CONNECT", "CHROME_DEVTOOLS_AXI_BROWSER_URL", "CHROME_DEVTOOLS_AXI_ALLOW_ATTACH"];
  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("is a no-op for the default isolated headless launch", () => {
    expect(() => assertAttachModeAllowed({})).not.toThrow();
    expect(() => buildTransportArgs()).not.toThrow();
  });

  it.each([
    { CHROME_DEVTOOLS_AXI_AUTO_CONNECT: "1" },
    { CHROME_DEVTOOLS_AXI_BROWSER_URL: "http://127.0.0.1:9222" },
    { CHROME_DEVTOOLS_AXI_BROWSER_URL: "wss://cluster.example/launch" },
  ])("refuses %j without CHROME_DEVTOOLS_AXI_ALLOW_ATTACH=1", (env) => {
    expect(() => assertAttachModeAllowed(env)).toThrow(/ALLOW_ATTACH/);
    Object.assign(process.env, env);
    expect(() => buildTransportArgs()).toThrow(/disabled in this build/);
  });

  it("allows them when explicitly opted in", () => {
    process.env.CHROME_DEVTOOLS_AXI_AUTO_CONNECT = "1";
    process.env.CHROME_DEVTOOLS_AXI_ALLOW_ATTACH = "1";
    expect(buildTransportArgs()).toContain("--autoConnect");
    expect(() => assertAttachModeAllowed({ CHROME_DEVTOOLS_AXI_BROWSER_URL: "http://x:1", CHROME_DEVTOOLS_AXI_ALLOW_ATTACH: "1" })).not.toThrow();
  });
});

describe("client presents the bridge token from the owner-only PID file", () => {
  let server: Server;
  const TOKEN = "k".repeat(64);

  beforeEach(async () => {
    const home = mkdtempSync(join(tmpdir(), "cda-home-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("CHROME_DEVTOOLS_AXI_SESSION", "");
    server = createBridgeServer(fakeClient, "default", undefined, TOKEN);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("is healthy only when the PID file holds the matching token", async () => {
    const { port } = server.address() as AddressInfo;
    const pidFile = resolveSessionPidFile();
    mkdirSync(join(pidFile, ".."), { recursive: true });

    expect(await checkBridgeHealth(port)).toBe(false); // no PID file: no token presented

    writeFileSync(pidFile, JSON.stringify({ pid: process.pid, port, token: "wrong" }));
    expect(await checkBridgeHealth(port)).toBe(false);

    writeFileSync(pidFile, JSON.stringify({ pid: process.pid, port, token: TOKEN }));
    expect(await checkBridgeHealth(port)).toBe(true);
  });

  it.skipIf(process.platform === "win32")("writePidFile stores the token in an owner-only file inside an owner-only directory", async () => {
    const { writePidFile } = await import("../src/bridge.js");
    const pidFile = resolveSessionPidFile();
    writePidFile(4321, "tok-123");
    const data = JSON.parse(readFileSync(pidFile, "utf-8"));
    expect(data).toEqual({ pid: process.pid, port: 4321, token: "tok-123" });
    expect(statSync(pidFile).mode & 0o077).toBe(0);
    expect(statSync(join(pidFile, "..")).mode & 0o077).toBe(0);
    // a pre-existing, world-readable file is tightened too
    chmodSync(pidFile, 0o644);
    writePidFile(4321, "tok-456");
    expect(statSync(pidFile).mode & 0o077).toBe(0);
  });
});

describe("a stale PID file never gets an unrelated process signalled", () => {
  beforeEach(() => {
    const home = mkdtempSync(join(tmpdir(), "cda-home-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("CHROME_DEVTOOLS_AXI_SESSION", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.skipIf(process.platform === "win32")("stopBridge leaves a live non-bridge process alone", async () => {
    const bystander = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });
    try {
      const pidFile = resolveSessionPidFile();
      mkdirSync(join(pidFile, ".."), { recursive: true });
      writeFileSync(pidFile, JSON.stringify({ pid: bystander.pid, port: 1 }));
      expect(await stopBridge()).toBe(false);
      expect(() => process.kill(bystander.pid as number, 0)).not.toThrow(); // still alive
    } finally {
      bystander.kill("SIGKILL");
    }
  });
});
