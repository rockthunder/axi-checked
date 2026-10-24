import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  collapseHomeDirectory,
  errorOutput,
  homeHeaderOutput,
  mergeOutput,
  renderError,
  renderOutput,
} from "../src/output.js";

const homeDir = homedir();
const execPath = `${homeDir}/.local/bin/gh-axi`;

describe("collapseHomeDirectory", () => {
  it("collapses the home prefix to tilde", () => {
    expect(collapseHomeDirectory(execPath, homeDir)).toBe(
      "~/.local/bin/gh-axi",
    );
  });
});

describe("homeHeaderOutput", () => {
  it("returns plain JS data for the executable path and description", () => {
    expect(
      homeHeaderOutput({
        execPath,
        homeDir,
        description: "Manage GitHub state for the current repo",
      }),
    ).toEqual({
      bin: "~/.local/bin/gh-axi",
      description: "Manage GitHub state for the current repo",
    });
  });
});

describe("errorOutput", () => {
  it("returns plain JS error data including suggestions", () => {
    expect(
      errorOutput("Missing title", "VALIDATION_ERROR", [
        'Run `tool create --title "..."`',
      ]),
    ).toEqual({
      error: "Missing title",
      code: "VALIDATION_ERROR",
      help: ['Run `tool create --title "..."`'],
    });
  });
});

describe("renderError", () => {
  it("serializes error data with the TOON library", () => {
    const output = renderError("Missing title", "VALIDATION_ERROR", [
      'Run tool create --title "..."',
    ]);

    expect(output).toContain("error: Missing title");
    expect(output).toContain("code: VALIDATION_ERROR");
    expect(output).toContain("help[1]:");
  });
});

describe("mergeOutput", () => {
  it("merges plain JS output objects", () => {
    expect(
      mergeOutput(
        homeHeaderOutput({
          execPath,
          homeDir,
          description: "Manage GitHub state for the current repo",
        }),
        { repo: "owner/name" },
        { help: ["Run gh-axi issue list"] },
      ),
    ).toEqual({
      bin: "~/.local/bin/gh-axi",
      description: "Manage GitHub state for the current repo",
      repo: "owner/name",
      help: ["Run gh-axi issue list"],
    });
  });
});

describe("renderOutput", () => {
  it("serializes a plain JS object to TOON", () => {
    const output = renderOutput({
      page: {
        title: "Home",
        refs: 3,
      },
      help: ["Run tool view <id> for details"],
    });

    expect(output).toContain("page:");
    expect(output).toContain("title: Home");
    expect(output).toContain("refs: 3");
    expect(output).toContain("help[1]:");
  });

  it("serializes multiline strings directly through TOON", () => {
    const output = renderOutput({
      snapshot: 'RootWebArea "Example"\n  uid=1 link "Docs"',
      browser: "no active session",
    });

    expect(output).toContain(
      'snapshot: "RootWebArea \\"Example\\"\\n  uid=1 link \\"Docs\\""',
    );
    expect(output).toContain("browser: no active session");
  });
});
