import type { AdoContext } from "../context.js";
import { requireRepo } from "../context.js";
import { azRepos, type Json } from "../az.js";
import { scrubTool } from "../errors.js";

function summarizePr(pr: Json) {
  return {
    id: pr.pullRequestId,
    title: pr.title,
    status: String(pr.status ?? "").toLowerCase(),
    source: stripRefs(pr.sourceRefName),
    target: stripRefs(pr.targetRefName),
    created_by: pr.createdBy?.uniqueName ?? pr.createdBy?.displayName ?? null,
    is_draft: Boolean(pr.isDraft),
  };
}

function stripRefs(ref?: string): string | null {
  if (!ref) return null;
  return ref.replace(/^refs\/heads\//, "");
}

export async function homeCommand(
  _args: string[],
  ctx?: AdoContext,
): Promise<Record<string, unknown>> {
  if (!ctx?.org || !ctx.project || !ctx.repo) {
    return {
      target: "none",
      help: [
        "No Azure DevOps repo resolved — pass `--org <org> --project <project> -R <repo>` after a command",
        "Or run inside a git repository whose origin remote points at Azure DevOps",
        "Run `ado-axi pr list --status active` once a target is set",
      ],
    };
  }

  const target = requireRepo(ctx);
  let prs: Json[] = [];
  let prError: string | undefined;
  try {
    const result = await azRepos(
      [
        "pr",
        "list",
        "--repository",
        target.repo,
        "--status",
        "active",
        "--top",
        "5",
      ],
      target,
    );
    prs = Array.isArray(result) ? result : [];
  } catch (error) {
    prError =
      error instanceof Error
        ? scrubTool(error.message)
        : scrubTool(String(error));
  }

  const help = [
    "Run `ado-axi pr list --status active` for more pull requests",
    "Run `ado-axi pr view <id>` for details",
    "Run `ado-axi ref list` to see branches",
    "Run `ado-axi run list` for recent pipeline runs",
  ];

  if (prError) {
    return {
      org: target.org,
      project: target.project,
      repo: target.repo,
      pull_requests: `unavailable - ${prError}`,
      help,
    };
  }

  return {
    org: target.org,
    project: target.project,
    repo: target.repo,
    count: prs.length,
    pull_requests: prs.length ? prs.map(summarizePr) : "0 active",
    help,
  };
}
