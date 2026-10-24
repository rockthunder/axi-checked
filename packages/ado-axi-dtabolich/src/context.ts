import { execFileSync } from "node:child_process";
import { AxiError } from "./errors.js";

export interface AdoContext {
  /** Organization name (not URL), e.g. "myorg". */
  org?: string;
  /** Team project name or id. */
  project?: string;
  /** Git repository name or id. */
  repo?: string;
  /** How the primary identity was resolved. */
  source: "flag" | "env" | "git" | "mixed";
}

export function orgUrl(org: string): string {
  if (org.startsWith("https://") || org.startsWith("http://")) return org;
  return `https://dev.azure.com/${org}`;
}

/**
 * Resolve org / project / repo.
 *
 * Priority:
 * - org: --org > AZURE_DEVOPS_ORG > git remote > az devops configure
 * - project: --project > AZURE_DEVOPS_PROJECT > git remote > az devops configure
 * - repo: -R/--repo > AZURE_DEVOPS_REPO > git remote
 */
export function resolveAdoContext(options: {
  orgFlag?: string;
  projectFlag?: string;
  repoFlag?: string;
}): AdoContext | undefined {
  const git = parseGitRemote();
  const defaults = readAzDevopsDefaults();
  const envOrg = process.env["AZURE_DEVOPS_ORG"]?.trim();
  const envProject = process.env["AZURE_DEVOPS_PROJECT"]?.trim();
  const envRepo = process.env["AZURE_DEVOPS_REPO"]?.trim();

  const org =
    normalizeOrg(options.orgFlag) ||
    normalizeOrg(envOrg) ||
    git?.org ||
    normalizeOrg(defaults.organization);
  const project =
    options.projectFlag?.trim() ||
    envProject ||
    git?.project ||
    defaults.project;
  const repo = options.repoFlag?.trim() || envRepo || git?.repo;

  if (!org && !project && !repo) return undefined;

  let source: AdoContext["source"] = "mixed";
  if (options.orgFlag || options.projectFlag || options.repoFlag) {
    source =
      git || envOrg || envProject || envRepo || defaults.organization
        ? "mixed"
        : "flag";
  } else if (envOrg || envProject || envRepo) {
    source = git ? "mixed" : "env";
  } else if (git) {
    source = "git";
  }

  return { org, project, repo, source };
}

/** Best-effort read of `az devops configure --list` (offline, synchronous). */
function readAzDevopsDefaults(): {
  organization?: string;
  project?: string;
} {
  try {
    const raw = execFileSync("az", ["devops", "configure", "--list"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const out: { organization?: string; project?: string } = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*(organization|project)\s*=\s*(.+)\s*$/i);
      if (m) {
        out[m[1].toLowerCase() as "organization" | "project"] = m[2].trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function requireRepo(ctx?: AdoContext): Required<
  Pick<AdoContext, "org" | "project" | "repo">
> &
  AdoContext {
  if (!ctx?.org || !ctx.project || !ctx.repo) {
    throw new AxiError(
      "Could not determine Azure DevOps org/project/repo",
      "VALIDATION_ERROR",
      [
        "Pass `--org <org> --project <project> -R <repo>` after the command",
        "Or set AZURE_DEVOPS_ORG / AZURE_DEVOPS_PROJECT / AZURE_DEVOPS_REPO",
        "Or run inside a git repo whose origin remote points at Azure DevOps",
      ],
    );
  }
  return ctx as Required<Pick<AdoContext, "org" | "project" | "repo">> &
    AdoContext;
}

export function requireProject(ctx?: AdoContext): Required<
  Pick<AdoContext, "org" | "project">
> &
  AdoContext {
  if (!ctx?.org || !ctx.project) {
    throw new AxiError(
      "Could not determine Azure DevOps org/project",
      "VALIDATION_ERROR",
      [
        "Pass `--org <org> --project <project>` after the command",
        "Or set AZURE_DEVOPS_ORG / AZURE_DEVOPS_PROJECT",
        "Or run inside a git repo whose origin remote points at Azure DevOps",
      ],
    );
  }
  return ctx as Required<Pick<AdoContext, "org" | "project">> & AdoContext;
}

/** Normalize org name from URL or bare name. */
export function normalizeOrg(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;
  const https = trimmed.match(
    /^https?:\/\/dev\.azure\.com\/([^/]+)/i,
  );
  if (https) return decodeURIComponent(https[1]);
  const legacy = trimmed.match(
    /^https?:\/\/([^.]+)\.visualstudio\.com/i,
  );
  if (legacy) return decodeURIComponent(legacy[1]);
  if (/^https?:\/\//i.test(trimmed)) {
    throw new AxiError(
      `Unrecognized organization URL: ${trimmed}`,
      "VALIDATION_ERROR",
      ["Use `https://dev.azure.com/<org>` or a bare org name"],
    );
  }
  return trimmed;
}

export function parseRemoteUrl(url: string): AdoContext | undefined {
  // https://dev.azure.com/{org}/{project}/_git/{repo}
  let m = url.match(
    /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/?#]+)/i,
  );
  if (m) {
    return {
      org: decodeURIComponent(m[1]),
      project: decodeURIComponent(m[2]),
      repo: decodeURIComponent(m[3].replace(/\.git$/, "")),
      source: "git",
    };
  }

  // https://{org}.visualstudio.com/{project}/_git/{repo}
  // https://{org}.visualstudio.com/DefaultCollection/{project}/_git/{repo}
  m = url.match(
    /^https?:\/\/([^.]+)\.visualstudio\.com(?:\/DefaultCollection)?\/([^/]+)\/_git\/([^/?#]+)/i,
  );
  if (m) {
    return {
      org: decodeURIComponent(m[1]),
      project: decodeURIComponent(m[2]),
      repo: decodeURIComponent(m[3].replace(/\.git$/, "")),
      source: "git",
    };
  }

  // git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
  m = url.match(
    /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  );
  if (m) {
    return {
      org: decodeURIComponent(m[1]),
      project: decodeURIComponent(m[2]),
      repo: decodeURIComponent(m[3]),
      source: "git",
    };
  }

  // org@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}
  m = url.match(
    /^[^@]+@vs-ssh\.visualstudio\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  );
  if (m) {
    return {
      org: decodeURIComponent(m[1]),
      project: decodeURIComponent(m[2]),
      repo: decodeURIComponent(m[3]),
      source: "git",
    };
  }

  return undefined;
}

function parseGitRemote(): AdoContext | undefined {
  let url: string;
  try {
    url = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
  return parseRemoteUrl(url);
}
