import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxiError } from "../errors.js";
import type { AdoContext } from "../context.js";
import { requireRepo } from "../context.js";
import { azInvoke, azRepos, PR_ID_FLAGS, type Json } from "../az.js";
import {
  parseLimit,
  takeAllFlags,
  takeBoolFlag,
  takeFlag,
  takeNumber,
} from "../args.js";
import { truncateText } from "../toon.js";

export const PR_HELP = `usage: ado-axi pr <subcommand> [args] [flags]
subcommands[10]:
  list, view, create, update, complete, set-vote, reviewers, checks, diff, comment
flags{list}:
  --status active|completed|abandoned|all, --top <n>, --source-branch <name>, --target-branch <name>, --creator <user>
flags{view}:
  --full!
flags{create}:
  --title <text>, --source-branch <name>, --target-branch <name>, --description <text>, --draft!, --auto-complete!
flags{update}:
  --title <text>, --description <text>, --draft true|false, --auto-complete true|false
flags{complete}:
  --squash!, --delete-source-branch!, --merge-commit-message <text>
flags{set-vote}:
  --vote approve|approve-with-suggestions|wait-for-author|reject|reset
flags{reviewers}:
  --add <user>, --remove <user>, --required!
flags{checks}:
  (none)
flags{diff}:
  --full!
flags{comment}:
  --body <text>, --thread-id <id>
examples:
  ado-axi pr list --status active
  ado-axi pr view 42 --full
  ado-axi pr create --title "Fix auth" --source-branch feature/x --target-branch main
  ado-axi pr complete 42 --squash
  ado-axi pr set-vote 42 --vote approve
  ado-axi pr comment 42 --body "LGTM"
`;

function stripRefs(ref?: string): string | null {
  if (!ref) return null;
  return ref.replace(/^refs\/heads\//, "");
}

function summarizePr(pr: Json, full = false) {
  const description = truncateText(pr.description, full ? Number.MAX_SAFE_INTEGER : 800);
  return {
    id: pr.pullRequestId,
    title: pr.title,
    status: String(pr.status ?? "").toLowerCase(),
    source: stripRefs(pr.sourceRefName),
    target: stripRefs(pr.targetRefName),
    created_by: pr.createdBy?.uniqueName ?? pr.createdBy?.displayName ?? null,
    is_draft: Boolean(pr.isDraft),
    merge_status: pr.mergeStatus ?? null,
    reviewers: Array.isArray(pr.reviewers)
      ? pr.reviewers
          .map(
            (r: Json) =>
              `${r.uniqueName ?? r.displayName ?? "?"}:${voteLabel(r.vote)}`,
          )
          .join(",") || "none"
      : "none",
    url: pr.url ?? null,
    description: description.text || null,
  };
}

function voteLabel(vote?: number): string {
  switch (vote) {
    case 10:
      return "approve";
    case 5:
      return "approve-with-suggestions";
    case -5:
      return "wait-for-author";
    case -10:
      return "reject";
    default:
      return "none";
  }
}

function voteValue(label: string): number {
  switch (label) {
    case "approve":
      return 10;
    case "approve-with-suggestions":
      return 5;
    case "wait-for-author":
      return -5;
    case "reject":
      return -10;
    case "reset":
      return 0;
    default:
      throw new AxiError(
        `Invalid --vote: ${label}`,
        "VALIDATION_ERROR",
        [
          "Valid votes: approve, approve-with-suggestions, wait-for-author, reject, reset",
        ],
      );
  }
}

export async function prCommand(
  args: string[],
  ctx?: AdoContext,
): Promise<Record<string, unknown>> {
  const sub = args[0];
  if (!sub) {
    throw new AxiError("Missing pr subcommand", "VALIDATION_ERROR", [
      "Run `ado-axi pr list`",
      "Run `ado-axi pr --help`",
    ]);
  }
  const rest = args.slice(1);
  const target = requireRepo(ctx);

  switch (sub) {
    case "list":
      return listPrs(rest, target);
    case "view":
      return viewPr(rest, target);
    case "create":
      return createPr(rest, target);
    case "update":
      return updatePr(rest, target);
    case "complete":
      return completePr(rest, target);
    case "set-vote":
      return setVote(rest, target);
    case "reviewers":
      return reviewers(rest, target);
    case "checks":
      return checks(rest, target);
    case "diff":
      return diffPr(rest, target);
    case "comment":
      return commentPr(rest, target);
    default:
      throw new AxiError(`Unknown pr subcommand: ${sub}`, "VALIDATION_ERROR", [
        "Valid: list, view, create, update, complete, set-vote, reviewers, checks, diff, comment",
      ]);
  }
}

async function listPrs(args: string[], ctx: AdoContext) {
  const status = takeFlag(args, "--status") ?? "active";
  const top = parseLimit(takeFlag(args, "--top"), 30);
  const source = takeFlag(args, "--source-branch");
  const targetBranch = takeFlag(args, "--target-branch");
  const creator = takeFlag(args, "--creator");

  const cmd = [
    "pr",
    "list",
    "--repository",
    ctx.repo!,
    "--status",
    status,
    "--top",
    String(top),
  ];
  if (source) cmd.push("--source-branch", source);
  if (targetBranch) cmd.push("--target-branch", targetBranch);
  if (creator) cmd.push("--creator", creator);

  const result = await azRepos(cmd, ctx);
  const prs = Array.isArray(result) ? result : [];
  return {
    count: prs.length,
    pull_requests: prs.map((pr) => ({
      id: pr.pullRequestId,
      title: pr.title,
      status: String(pr.status ?? "").toLowerCase(),
      source: stripRefs(pr.sourceRefName),
      target: stripRefs(pr.targetRefName),
      created_by: pr.createdBy?.uniqueName ?? pr.createdBy?.displayName ?? null,
      is_draft: Boolean(pr.isDraft),
    })),
    help:
      prs.length === 0
        ? [
            `0 ${status} pull requests found`,
            "Run `ado-axi pr create --title \"...\" --source-branch <name>`",
          ]
        : [
            "Run `ado-axi pr view <id>` for details",
            "Run `ado-axi pr checks <id>` for policy/status checks",
          ],
  };
}

async function viewPr(args: string[], ctx: AdoContext) {
  const id = takeNumber(args, "pull request id");
  const full = takeBoolFlag(args, "--full");
  const pr = await azRepos(
    ["pr", "show", "--id", String(id)],
    ctx,
    PR_ID_FLAGS,
  );
  return {
    pull_request: summarizePr(pr, full),
    help: [
      "Run `ado-axi pr checks <id>` for policy evaluations",
      "Run `ado-axi pr diff <id>` for a bounded file diff summary",
      "Run `ado-axi pr complete <id>` to complete/merge",
    ],
  };
}

async function createPr(args: string[], ctx: AdoContext) {
  const title = takeFlag(args, "--title");
  const source = takeFlag(args, "--source-branch");
  const targetBranch = takeFlag(args, "--target-branch");
  const description = takeFlag(args, "--description");
  const draft = takeBoolFlag(args, "--draft");
  const autoComplete = takeBoolFlag(args, "--auto-complete");

  if (!title) {
    throw new AxiError("--title is required", "VALIDATION_ERROR", [
      'ado-axi pr create --title "..." --source-branch <name> [--target-branch main]',
    ]);
  }
  if (!source) {
    throw new AxiError("--source-branch is required", "VALIDATION_ERROR", [
      'ado-axi pr create --title "..." --source-branch <name>',
    ]);
  }

  const cmd = [
    "pr",
    "create",
    "--repository",
    ctx.repo!,
    "--title",
    title,
    "--source-branch",
    source,
  ];
  if (targetBranch) cmd.push("--target-branch", targetBranch);
  if (description) cmd.push("--description", description);
  if (draft) cmd.push("--draft", "true");
  if (autoComplete) cmd.push("--auto-complete", "true");

  const pr = await azRepos(cmd, ctx);
  return {
    pull_request: summarizePr(pr),
    help: [
      `Run \`ado-axi pr view ${pr.pullRequestId}\``,
      `Run \`ado-axi pr set-vote ${pr.pullRequestId} --vote approve\``,
    ],
  };
}

async function updatePr(args: string[], ctx: AdoContext) {
  const id = takeNumber(args, "pull request id");
  const title = takeFlag(args, "--title");
  const description = takeFlag(args, "--description");
  const draft = takeFlag(args, "--draft");
  const autoComplete = takeFlag(args, "--auto-complete");

  if (!title && !description && draft === undefined && autoComplete === undefined) {
    throw new AxiError(
      "Nothing to update — pass --title, --description, --draft, or --auto-complete",
      "VALIDATION_ERROR",
    );
  }

  const cmd = ["pr", "update", "--id", String(id)];
  if (title) cmd.push("--title", title);
  if (description) cmd.push("--description", description);
  if (draft !== undefined) cmd.push("--draft", draft);
  if (autoComplete !== undefined) cmd.push("--auto-complete", autoComplete);

  const pr = await azRepos(cmd, ctx, PR_ID_FLAGS);
  return {
    pull_request: summarizePr(pr),
    help: [`Run \`ado-axi pr view ${id}\``],
  };
}

async function completePr(args: string[], ctx: AdoContext) {
  const id = takeNumber(args, "pull request id");
  const squash = takeBoolFlag(args, "--squash");
  const deleteSource = takeBoolFlag(args, "--delete-source-branch");
  const message = takeFlag(args, "--merge-commit-message");

  const current = await azRepos(
    ["pr", "show", "--id", String(id)],
    ctx,
    PR_ID_FLAGS,
  );
  if (String(current.status).toLowerCase() === "completed") {
    return {
      pull_request: summarizePr(current),
      already: true,
      help: [`Pull request #${id} already completed (no-op)`],
    };
  }

  const cmd = ["pr", "update", "--id", String(id), "--status", "completed"];
  if (squash) cmd.push("--squash", "true");
  if (deleteSource) cmd.push("--delete-source-branch", "true");
  if (message) cmd.push("--merge-commit-message", message);

  const pr = await azRepos(cmd, ctx, PR_ID_FLAGS);
  return {
    pull_request: summarizePr(pr),
    help: [`Run \`ado-axi pr view ${id}\``],
  };
}

async function setVote(args: string[], ctx: AdoContext) {
  const id = takeNumber(args, "pull request id");
  const vote = takeFlag(args, "--vote");
  if (!vote) {
    throw new AxiError("--vote is required", "VALIDATION_ERROR", [
      "ado-axi pr set-vote <id> --vote approve",
    ]);
  }
  // Validate against known labels; az accepts the string form directly.
  voteValue(vote);
  const pr = await azRepos(
    ["pr", "set-vote", "--id", String(id), "--vote", vote],
    ctx,
    PR_ID_FLAGS,
  );
  return {
    pull_request: summarizePr(pr),
    help: [`Run \`ado-axi pr view ${id}\``],
  };
}

async function reviewers(args: string[], ctx: AdoContext) {
  const id = takeNumber(args, "pull request id");
  const add = takeAllFlags(args, "--add");
  const remove = takeAllFlags(args, "--remove");
  const required = takeBoolFlag(args, "--required");

  if (add.length === 0 && remove.length === 0) {
    const pr = await azRepos(
      ["pr", "show", "--id", String(id)],
      ctx,
      PR_ID_FLAGS,
    );
    return {
      id,
      reviewers: Array.isArray(pr.reviewers)
        ? pr.reviewers.map((r: Json) => ({
            name: r.uniqueName ?? r.displayName ?? null,
            vote: voteLabel(r.vote),
            is_required: Boolean(r.isRequired),
          }))
        : [],
      help: [
        "Run `ado-axi pr reviewers <id> --add <user>`",
        "Run `ado-axi pr reviewers <id> --remove <user>`",
      ],
    };
  }

  for (const user of add) {
    const cmd = ["pr", "reviewer", "add", "--id", String(id), "--reviewers", user];
    if (required) cmd.push("--required", "true");
    await azRepos(cmd, ctx, PR_ID_FLAGS);
  }
  for (const user of remove) {
    await azRepos(
      ["pr", "reviewer", "remove", "--id", String(id), "--reviewers", user],
      ctx,
      PR_ID_FLAGS,
    );
  }

  const pr = await azRepos(
    ["pr", "show", "--id", String(id)],
    ctx,
    PR_ID_FLAGS,
  );
  return {
    pull_request: summarizePr(pr),
    help: [`Run \`ado-axi pr view ${id}\``],
  };
}

async function checks(args: string[], ctx: AdoContext) {
  const id = takeNumber(args, "pull request id");
  let evaluations: Json[] = [];
  try {
    const result = await azRepos(
      ["pr", "policy", "list", "--id", String(id), "--detect", "false"],
      ctx,
      PR_ID_FLAGS,
    );
    evaluations = Array.isArray(result) ? result : result?.value ?? [];
  } catch {
    // Fall back to statuses via invoke when policy list is unavailable.
    const pr = await azRepos(
      ["pr", "show", "--id", String(id)],
      ctx,
      PR_ID_FLAGS,
    );
    const statuses = await azInvoke<Json>({
      area: "git",
      resource: "pullRequestStatuses",
      routeParameters: {
        project: ctx.project!,
        repositoryId: pr.repository?.id ?? ctx.repo!,
        pullRequestId: String(id),
      },
      apiVersion: "7.1",
      ctx,
    });
    evaluations = Array.isArray(statuses)
      ? statuses
      : statuses?.value ?? [];
  }

  const rows = evaluations.map((e: Json) => {
    if (e.configuration || e.status !== undefined && e.context) {
      // pullRequestStatuses shape
      if (e.context) {
        return {
          name: e.context?.name ?? e.description ?? "status",
          state: String(e.state ?? "").toLowerCase(),
          description: e.description ?? null,
        };
      }
      // policy evaluation shape
      return {
        name:
          e.configuration?.displayName ??
          e.configuration?.type?.displayName ??
          "policy",
        state: String(e.status ?? e.evaluationStatus ?? "").toLowerCase(),
        description: e.context?.genre ?? null,
      };
    }
    return {
      name: e.configuration?.displayName ?? e.name ?? "check",
      state: String(e.status ?? e.state ?? "").toLowerCase(),
      description: e.description ?? null,
    };
  });

  const passed = rows.filter((r) =>
    /approved|passed|succeeded|completed|ok/i.test(r.state),
  ).length;
  const failed = rows.filter((r) =>
    /rejected|failed|broken|error/i.test(r.state),
  ).length;
  const pending = rows.length - passed - failed;

  return {
    id,
    checks: `${passed} passed, ${failed} failed, ${pending} pending`,
    evaluations: rows.length ? rows : "0 checks",
    help: [
      "Run `ado-axi pr view <id>` for PR details",
      "Run `ado-axi run list` for pipeline runs",
    ],
  };
}

async function diffPr(args: string[], ctx: AdoContext) {
  const id = takeNumber(args, "pull request id");
  const full = takeBoolFlag(args, "--full");
  const pr = await azRepos(
    ["pr", "show", "--id", String(id)],
    ctx,
    PR_ID_FLAGS,
  );
  const iterations = await azInvoke<Json>({
    area: "git",
    resource: "pullRequestIterations",
    routeParameters: {
      project: ctx.project!,
      repositoryId: pr.repository?.id ?? ctx.repo!,
      pullRequestId: String(id),
    },
    apiVersion: "7.1",
    ctx,
  });
  const list = Array.isArray(iterations) ? iterations : iterations?.value ?? [];
  const latest = list[list.length - 1];
  if (!latest?.id) {
    return {
      id,
      files: "0 changed files",
      help: ["No iteration/diff available for this pull request"],
    };
  }

  const changes = await azInvoke<Json>({
    area: "git",
    resource: "pullRequestIterationChanges",
    routeParameters: {
      project: ctx.project!,
      repositoryId: pr.repository?.id ?? ctx.repo!,
      pullRequestId: String(id),
      iterationId: String(latest.id),
    },
    apiVersion: "7.1",
    ctx,
  });
  const changeEntries = Array.isArray(changes?.changeEntries)
    ? changes.changeEntries
    : Array.isArray(changes)
      ? changes
      : [];

  const files = changeEntries.map((c: Json) => ({
    path: c.item?.path ?? c.originalPath ?? "?",
    change: String(c.changeType ?? "").toLowerCase(),
  }));

  const limited = full ? files : files.slice(0, 40);
  return {
    id,
    count: files.length,
    files: limited.length ? limited : "0 changed files",
    help: full
      ? [`Run \`ado-axi pr view ${id}\``]
      : [
          files.length > 40
            ? `Run \`ado-axi pr diff ${id} --full\` for all ${files.length} files`
            : `Run \`ado-axi pr view ${id}\``,
        ],
  };
}

async function commentPr(args: string[], ctx: AdoContext) {
  const id = takeNumber(args, "pull request id");
  const body = takeFlag(args, "--body");
  const threadId = takeFlag(args, "--thread-id");
  if (!body) {
    throw new AxiError("--body is required", "VALIDATION_ERROR", [
      'ado-axi pr comment <id> --body "..."',
    ]);
  }

  const pr = await azRepos(
    ["pr", "show", "--id", String(id)],
    ctx,
    PR_ID_FLAGS,
  );
  const dir = mkdtempSync(join(tmpdir(), "ado-axi-"));
  const file = join(dir, "body.json");
  try {
    if (threadId) {
      writeFileSync(
        file,
        JSON.stringify({ content: body, parentCommentId: 0 }),
      );
      await azInvoke({
        area: "git",
        resource: "pullRequestThreadComments",
        method: "POST",
        routeParameters: {
          project: ctx.project!,
          repositoryId: pr.repository?.id ?? ctx.repo!,
          pullRequestId: String(id),
          threadId,
        },
        inFile: file,
        apiVersion: "7.1",
        ctx,
      });
    } else {
      writeFileSync(
        file,
        JSON.stringify({
          comments: [{ parentCommentId: 0, content: body, commentType: 1 }],
          status: 1,
        }),
      );
      await azInvoke({
        area: "git",
        resource: "pullRequestThreads",
        method: "POST",
        routeParameters: {
          project: ctx.project!,
          repositoryId: pr.repository?.id ?? ctx.repo!,
          pullRequestId: String(id),
        },
        inFile: file,
        apiVersion: "7.1",
        ctx,
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  return {
    id,
    comment: "created",
    help: [`Run \`ado-axi pr view ${id}\``],
  };
}
