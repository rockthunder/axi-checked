import { describe, it, expect } from "vitest";
import { immediateParent } from "../src/metabase/collection.js";

describe("immediateParent", () => {
  it("returns undefined at the top level", () => {
    expect(immediateParent("/")).toBeUndefined();
    expect(immediateParent(undefined)).toBeUndefined();
  });
  it("returns the last ancestor id from a location path", () => {
    expect(immediateParent("/1/")).toBe("1");
    expect(immediateParent("/1/2/")).toBe("2");
    expect(immediateParent("/10/20/30/")).toBe("30");
  });
});
