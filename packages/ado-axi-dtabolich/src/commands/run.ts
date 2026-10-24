import { AxiError } from "../errors.js";
import type { AdoContext } from "../context.js";
import { requireProject } from "../context.js";
import { azPipelines, azText, type Json } from "../az.js";
import { parseLimit, takeBoolFlag, takeFlag, takeNumber } from "../args.js";
import { truncateText } from "../toon.js";

export const RUN_HELP = `usage: ado-axi run <subcommand> [args] [flags]
subcommands[4]:
  list, view, log, watch
flags{list}:
  --branch <name>, --status all|completed|inProgress|notStarted, --result succeeded|failed|canceled|partiallySucceeded, --top <n>, --pipeline-id <id>
flags{view}:
  (none)
flags{log}:
  --full!
flags{watch}:
  --interval <seconds>
examples:
  ado-axi run list --branch main
  ado-axi run view 12345
  ado-axi run log 12345
  ado-axi run watch 12345
`;

function summarizeRun(run: Json) {
  return {
    id: run.id,
    build_number: run.buildNumber ?? null,
    status: String(run.status ?? "").toLowerCase(),
    result: run.result ? String(run.result).toLowerCase() : null,
    pipeline: run.definition?.name ?? null,
    pipeline_id: run.definition?.id ?? null,
    branch: run.sourceBranch
      ? String(run.sourceBranch).replace(/^refs\/heads\//, "")
      : null,
    source_version: run.sourceVersion?.slice(0, 12) ?? null,
    requested_for:
      run.requestedFor?.uniqueName ?? run.requestedFor?.displayName ?? null,
    finish_time: run.finishTime ?? null,
    url: run._links?.web?.href ?? run.url ?? null,
  };
}

export async function runCommand(
  args: string[],
  ctx?: AdoContext,
): Promise<Record<string, unknown>> {
  const sub = args[0];
  if (!sub) {
    throw new AxiError("Missing run subcommand", "VALIDATION_ERROR", [
      "Run `ado-axi run list`",
      "Run `ado-axi run --help`",
    ]);
  }
  const rest = args.slice(1);
  const project = requireProject(ctx);

  switch (sub) {
    case "list": {
      const branch = takeFlag(rest, "--branch");
      const status = takeFlag(rest, "--status");
      const result = takeFlag(rest, "--result");
      const top = parseLimit(takeFlag(rest, "--top"), 20);
      const pipelineId = takeFlag(rest, "--pipeline-id");
      const cmd = ["runs", "list", "--top", String(top)];
      if (branch) cmd.push("--branch", branch);
      if (status) cmd.push("--status", status);
      if (result) cmd.push("--result", result);
      if (pipelineId) cmd.push("--pipeline-ids", pipelineId);

      const runs = await azPipelines(cmd, project);
      const list = Array.isArray(runs) ? runs : [];
      return {
        count: list.length,
        runs: list.map(summarizeRun),
        help:
          list.length === 0
            ? ["0 pipeline runs found"]
            : [
                "Run `ado-axi run view <id>` for details",
                "Run `ado-axi run log <id>` for truncated logs",
              ],
      };
    }
    case "view": {
      const id = takeNumber(rest, "run id");
      const run = await azPipelines(["runs", "show", "--id", String(id)], project);
      return {
        run: summarizeRun(run),
        help: [
          `Run \`ado-axi run log ${id}\``,
          `Run \`ado-axi run watch ${id}\``,
        ],
      };
    }
    case "log": {
      const id = takeNumber(rest, "run id");
      const full = takeBoolFlag(rest, "--full");
      // az pipelines runs show does not dump logs; use build log via REST-ish helper:
      // `az pipelines build show` is aliased under runs show; logs via:
      // az devops invoke area=build resource=builds ... or az pipelines runs artifact
      // Practical approach: use `az pipelines build show` timeline is hard —
      // fetch via `az rest` isn't preferred. Use invoke build logs list then content.
      let text = "";
      try {
        text = await azText(
          [
            "pipelines",
            "runs",
            "show",
            "--id",
            String(id),
            "--open",
            "false",
            "--query",
            "logs.url",
            "-o",
            "tsv",
          ],
          project,
        );
      } catch {
        text = "";
      }

      // Fallback: show run summary when raw logs aren't easily available via CLI.
      const run = await azPipelines(["runs", "show", "--id", String(id)], project);
      const summary = [
        `run ${id}`,
        `status=${run.status}`,
        `result=${run.result ?? "none"}`,
        `pipeline=${run.definition?.name ?? "?"}`,
        `branch=${run.sourceBranch ?? "?"}`,
        text ? `logs_url=${text.trim()}` : "logs_url=unavailable",
        "Tip: open the run URL in a browser for full job logs, or use ado-axi api for build log content",
      ].join("\n");
      const truncated = truncateText(summary, full ? Number.MAX_SAFE_INTEGER : 2000);
      return {
        id,
        log: truncated.text,
        help: [
          `Run \`ado-axi run view ${id}\``,
          full
            ? "Full summary shown"
            : "Run `ado-axi run log <id> --full` for the untruncated summary",
        ],
      };
    }
    case "watch": {
      const id = takeNumber(rest, "run id");
      const intervalRaw = takeFlag(rest, "--interval");
      const interval = Math.max(
        2,
        parseLimit(intervalRaw, 5),
      );
      const deadline = Date.now() + 15 * 60 * 1000;
      let run = await azPipelines(["runs", "show", "--id", String(id)], project);
      while (
        String(run.status).toLowerCase() !== "completed" &&
        Date.now() < deadline
      ) {
        await sleep(interval * 1000);
        run = await azPipelines(["runs", "show", "--id", String(id)], project);
      }
      const completed = String(run.status).toLowerCase() === "completed";
      const result = String(run.result ?? "").toLowerCase();
      const ok = completed && (result === "succeeded" || result === "partiallysucceeded");
      if (!ok) {
        process.exitCode = 1;
      }
      return {
        run: summarizeRun(run),
        watched: true,
        help: ok
          ? [`Run ${id} finished successfully`]
          : [
              `Run ${id} finished with status=${run.status} result=${run.result ?? "none"}`,
              `Run \`ado-axi run log ${id}\``,
            ],
      };
    }
    default:
      throw new AxiError(`Unknown run subcommand: ${sub}`, "VALIDATION_ERROR", [
        "Valid: list, view, log, watch",
      ]);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
