import { describe, expect, it } from "vitest";
import { parseFlags, many, one } from "./flags.js";
import { assertOneOf, DATE_RANGES } from "./reports.js";

describe("parseFlags", () => {
  it("separates positionals, values and booleans", () => {
    const parsed = parseFlags(["Client call", "--project", "abc", "--billable"], {
      value: ["project"],
      boolean: ["billable"],
    });
    expect(parsed.positionals).toEqual(["Client call"]);
    expect(one(parsed, "project")).toBe("abc");
    expect(parsed.booleans.has("billable")).toBe(true);
  });

  it("collects repeated value flags", () => {
    const parsed = parseFlags(["--tag", "a", "--tag=b"], { value: ["tag"] });
    expect(many(parsed, "tag")).toEqual(["a", "b"]);
  });

  it("rejects unknown flags and missing values", () => {
    expect(() => parseFlags(["--nope"], { boolean: ["billable"] })).toThrow(/Unknown flag/);
    expect(() => parseFlags(["--project"], { value: ["project"] })).toThrow(/requires a value/);
  });
});

describe("assertOneOf", () => {
  it("accepts a valid date range", () => {
    expect(() => assertOneOf("THIS_WEEK", DATE_RANGES, "--range")).not.toThrow();
  });

  it("rejects an invalid date range", () => {
    expect(() => assertOneOf("YESTERDAY", DATE_RANGES, "--range")).toThrow(/Unknown --range value/);
  });
});
