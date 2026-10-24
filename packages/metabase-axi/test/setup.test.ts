import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { setupCommand } from "../src/commands/setup.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("setup command", () => {
  it("rejects an unknown subcommand", async () => {
    await expect(setupCommand(["bogus"])).rejects.toBeInstanceOf(AxiError);
  });

  it("installs the SessionStart hook into the given home dir", async () => {
    const home = mkdtempSync(join(tmpdir(), "mb-axi-home-"));
    dirs.push(home);
    // Bypass the SDK's "real installed binary" gate so the test can run from node/vitest.
    const out = await setupCommand(["hooks"], { homeDir: home, shouldInstall: () => true });
    expect(out.setup).toContain("hooks installed");

    const settingsPath = join(home, ".claude", "settings.json");
    expect(existsSync(settingsPath)).toBe(true);
    expect(readFileSync(settingsPath, "utf-8")).toContain("metabase-axi");
  });
});
