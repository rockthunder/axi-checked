import { describe, it, expect } from "vitest";
import { runAxiCli } from "axi-sdk-js";
import { cliOptions, TOP_HELP } from "../src/cli.js";
import { readVersion } from "../src/meta.js";
import { homeCommand } from "../src/commands/home.js";

/** Run the CLI end-to-end with captured stdout. */
async function run(argv: string[]): Promise<string> {
  const chunks: string[] = [];
  await runAxiCli(cliOptions({ argv, stdout: { write: (c: string) => chunks.push(c) } }));
  return chunks.join("");
}

describe("metabase-axi cli (scaffold)", () => {
  it("prints TOP_HELP on --help", async () => {
    const out = await run(["--help"]);
    expect(out).toBe(TOP_HELP);
    expect(out).toContain("metabase-axi query --help");
  });

  it("prints the package version on --version", async () => {
    const out = await run(["--version"]);
    expect(out.trim()).toBe(readVersion());
  });

  it("renders a structured error for an unknown command", async () => {
    const out = await run(["bogus"]);
    expect(out).toContain("Unknown command");
  });

  it("renders per-command help via getCommandHelp", async () => {
    const out = await run(["query", "--help"]);
    expect(out).toContain("usage: metabase-axi query");
    expect(out).toContain("--csv-out");
  });

  it("home runs without throwing and its help includes --help and <command> --help", async () => {
    const out = await homeCommand();
    const help = (out.help as string[]) ?? [];
    expect(Array.isArray(out.help)).toBe(true);
    expect(help.some((h) => h.includes("metabase-axi --help"))).toBe(true);
    expect(help.some((h) => h.includes("metabase-axi <command> --help"))).toBe(true);
  });
});
