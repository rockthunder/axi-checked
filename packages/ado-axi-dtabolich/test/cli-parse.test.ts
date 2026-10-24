import { describe, expect, it } from "vitest";
import { parseAdoContextArgs } from "../src/cli.js";

describe("parseAdoContextArgs", () => {
  it("strips org/project/repo selectors", () => {
    const parsed = parseAdoContextArgs([
      "list",
      "--status",
      "active",
      "--org",
      "myorg",
      "--project",
      "MyProject",
      "-R",
      "my-repo",
    ]);
    expect(parsed.orgFlag).toBe("myorg");
    expect(parsed.projectFlag).toBe("MyProject");
    expect(parsed.repoFlag).toBe("my-repo");
    expect(parsed.strippedArgs).toEqual(["list", "--status", "active"]);
  });
});
