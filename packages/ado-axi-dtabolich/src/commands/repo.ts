import { AxiError } from "../errors.js";
import type { AdoContext } from "../context.js";
import { requireProject, requireRepo } from "../context.js";
import { azRepos, type Json } from "../az.js";
import { takeBoolFlag } from "../args.js";

export const REPO_HELP = `usage: ado-axi repo <subcommand> [args] [flags]
subcommands[2]:
  list, show
flags{list}:
  (none)
flags{show}:
  --full!
examples:
  ado-axi repo list
  ado-axi repo show
  ado-axi repo show -R other-repo
`;

function summarizeRepo(repo: Json, full = false) {
  return {
    id: repo.id,
    name: repo.name,
    default_branch: repo.defaultBranch
      ? String(repo.defaultBranch).replace(/^refs\/heads\//, "")
      : null,
    project: repo.project?.name ?? null,
    url: repo.webUrl ?? repo.remoteUrl ?? null,
    size: full ? (repo.size ?? null) : undefined,
    is_disabled: Boolean(repo.isDisabled),
  };
}

export async function repoCommand(
  args: string[],
  ctx?: AdoContext,
): Promise<Record<string, unknown>> {
  const sub = args[0];
  if (!sub) {
    throw new AxiError("Missing repo subcommand", "VALIDATION_ERROR", [
      "Run `ado-axi repo list`",
      "Run `ado-axi repo --help`",
    ]);
  }
  const rest = args.slice(1);

  switch (sub) {
    case "list": {
      const project = requireProject(ctx);
      const result = await azRepos(["list"], project);
      const repos = Array.isArray(result) ? result : [];
      return {
        count: repos.length,
        repositories: repos.map((r) => ({
          id: r.id,
          name: r.name,
          default_branch: r.defaultBranch
            ? String(r.defaultBranch).replace(/^refs\/heads\//, "")
            : null,
        })),
        help:
          repos.length === 0
            ? ["0 repositories found in this project"]
            : [
                "Run `ado-axi repo show -R <name>` for details",
                "Run `ado-axi pr list -R <name>` for pull requests",
              ],
      };
    }
    case "show": {
      const full = takeBoolFlag(rest, "--full");
      const target = requireRepo(ctx);
      const repo = await azRepos(["show", "--repository", target.repo], target);
      return {
        repository: summarizeRepo(repo, full),
        help: [
          "Run `ado-axi ref list` for branches",
          "Run `ado-axi pr list --status active` for open pull requests",
        ],
      };
    }
    default:
      throw new AxiError(`Unknown repo subcommand: ${sub}`, "VALIDATION_ERROR", [
        "Valid: list, show",
      ]);
  }
}
