import { describe, expect, it } from "vitest";
import { rejectUnknownFlags, takeFlag } from "../src/args.js";
import { AxiError } from "../src/errors.js";
import { PR_HELP } from "../src/commands/pr.js";

describe("takeFlag", () => {
  it("supports space and equals forms", () => {
    const a = ["--status", "active", "x"];
    expect(takeFlag(a, "--status")).toBe("active");
    expect(a).toEqual(["x"]);

    const b = ["--status=completed"];
    expect(takeFlag(b, "--status")).toBe("completed");
    expect(b).toEqual([]);
  });
});

describe("rejectUnknownFlags", () => {
  it("rejects unknown flags for a declared subcommand", () => {
    expect(() =>
      rejectUnknownFlags(PR_HELP, "pr", "list", ["--stat", "active"]),
    ).toThrow(AxiError);
  });

  it("allows declared flags", () => {
    expect(() =>
      rejectUnknownFlags(PR_HELP, "pr", "list", ["--status", "active"]),
    ).not.toThrow();
  });
});
