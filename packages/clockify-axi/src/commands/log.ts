import { usageError } from "../usage.js";
import { many, one, parseFlags } from "../flags.js";
import { post } from "../rest.js";
import { getIdentity } from "../identity.js";

export const LOG_HELP = `clockify-axi log <start> <end> <description> [flags]

Log a completed time entry - one that already happened, unlike \`timer\`.

Arguments:
  <start>        ISO 8601 start time, e.g. 2026-09-15T09:00:00Z
  <end>          ISO 8601 end time
  <description>  What the entry was for (remaining args are joined with spaces)

Flags:
  --project <id>       Project ID (see \`clockify-axi projects list\`)
  --task <id>          Task ID, requires --project
  --tag <id>           Tag ID, repeatable (see \`clockify-axi tags list\`)
  --billable           Mark the entry billable

Examples:
  clockify-axi log 2026-09-15T09:00:00Z 2026-09-15T10:30:00Z Client call --project 671...e56`;

export async function logCommand(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseFlags(args, {
    value: ["project", "task", "tag"],
    boolean: ["billable"],
  });
  const [start, end, ...rest] = flags.positionals;
  const description = rest.join(" ").trim();
  if (!start || !end || !description) {
    throw usageError("log requires <start> <end> <description>", [
      "clockify-axi log 2026-09-15T09:00:00Z 2026-09-15T10:30:00Z Client call",
    ]);
  }

  const identity = await getIdentity();
  const tagIds = many(flags, "tag");
  const logged = await post(`/workspaces/${identity.workspaceId}/time-entries`, {
    start,
    end,
    description,
    ...(one(flags, "project") ? { projectId: one(flags, "project") } : {}),
    ...(one(flags, "task") ? { taskId: one(flags, "task") } : {}),
    ...(tagIds ? { tagIds } : {}),
    ...(flags.booleans.has("billable") ? { billable: true } : {}),
  });

  return { logged, help: ["clockify-axi report detail --range THIS_WEEK"] };
}
