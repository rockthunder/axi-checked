import { describe, expect, it } from "vitest";
import { resolveProjectPlaywrightCli } from "../src/commands/setup.js";

// Corporate-build hardening: `setup` never runs `npx --yes playwright`; it uses the project's own
// installed Playwright CLI or prints the command.
describe("resolveProjectPlaywrightCli", () => {
  it("finds the installed playwright CLI from this workspace", () => {
    const cli = resolveProjectPlaywrightCli(process.cwd());
    expect(cli).not.toBeNull();
    expect(cli).toMatch(/cli\.js$/);
  });
});
