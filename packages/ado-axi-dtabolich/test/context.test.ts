import { describe, expect, it } from "vitest";
import {
  normalizeOrg,
  parseRemoteUrl,
  resolveAdoContext,
} from "../src/context.js";

describe("parseRemoteUrl", () => {
  it("parses https://dev.azure.com remotes", () => {
    expect(
      parseRemoteUrl(
        "https://dev.azure.com/myorg/MyProject/_git/my-repo",
      ),
    ).toEqual({
      org: "myorg",
      project: "MyProject",
      repo: "my-repo",
      source: "git",
    });
  });

  it("parses ssh.dev.azure.com remotes", () => {
    expect(
      parseRemoteUrl("git@ssh.dev.azure.com:v3/myorg/MyProject/my-repo"),
    ).toEqual({
      org: "myorg",
      project: "MyProject",
      repo: "my-repo",
      source: "git",
    });
  });

  it("parses visualstudio.com remotes", () => {
    expect(
      parseRemoteUrl(
        "https://myorg.visualstudio.com/MyProject/_git/my-repo",
      ),
    ).toEqual({
      org: "myorg",
      project: "MyProject",
      repo: "my-repo",
      source: "git",
    });
  });

  it("returns undefined for GitHub remotes", () => {
    expect(
      parseRemoteUrl("https://github.com/acme/widgets.git"),
    ).toBeUndefined();
  });
});

describe("normalizeOrg", () => {
  it("accepts bare org names and org URLs", () => {
    expect(normalizeOrg("myorg")).toBe("myorg");
    expect(normalizeOrg("https://dev.azure.com/myorg/")).toBe("myorg");
    expect(normalizeOrg("https://myorg.visualstudio.com")).toBe("myorg");
  });
});

describe("resolveAdoContext", () => {
  it("prefers explicit flags over env", () => {
    const prevOrg = process.env.AZURE_DEVOPS_ORG;
    const prevProject = process.env.AZURE_DEVOPS_PROJECT;
    const prevRepo = process.env.AZURE_DEVOPS_REPO;
    process.env.AZURE_DEVOPS_ORG = "env-org";
    process.env.AZURE_DEVOPS_PROJECT = "env-project";
    process.env.AZURE_DEVOPS_REPO = "env-repo";
    try {
      const ctx = resolveAdoContext({
        orgFlag: "flag-org",
        projectFlag: "flag-project",
        repoFlag: "flag-repo",
      });
      expect(ctx?.org).toBe("flag-org");
      expect(ctx?.project).toBe("flag-project");
      expect(ctx?.repo).toBe("flag-repo");
    } finally {
      if (prevOrg === undefined) delete process.env.AZURE_DEVOPS_ORG;
      else process.env.AZURE_DEVOPS_ORG = prevOrg;
      if (prevProject === undefined) delete process.env.AZURE_DEVOPS_PROJECT;
      else process.env.AZURE_DEVOPS_PROJECT = prevProject;
      if (prevRepo === undefined) delete process.env.AZURE_DEVOPS_REPO;
      else process.env.AZURE_DEVOPS_REPO = prevRepo;
    }
  });
});
