import { usageError } from "../usage.js";
import { many, one, parseFlags } from "../flags.js";
import { get, patch, post } from "../rest.js";
import { getIdentity } from "../identity.js";

export const TIMER_HELP = `clockify-axi timer <status|start|stop> [flags]

Manage the running timer for the active user.

  timer status                     What's running right now, if anything
  timer start [description]        Start a new timer
  timer stop [--end <iso>]         Stop the running timer

Flags (start only):
  --project <id>       Project ID (see \`clockify-axi projects list\`)
  --task <id>          Task ID, requires --project
  --tag <id>           Tag ID, repeatable (see \`clockify-axi tags list\`)
  --billable           Mark the entry billable
  --start <iso>        ISO 8601 start time (default: now)

Flags (stop only):
  --end <iso>          ISO 8601 end time (default: now)

Note: some workspaces/projects require a project and/or task on every time
entry. If the running timer is missing one, \`timer stop\` will fail with
Clockify's own error - pass --project/--task on \`timer start\` next time, or
edit the entry in Clockify.

Examples:
  clockify-axi timer status
  clockify-axi timer start "Client call" --project 671...e56 --billable
  clockify-axi timer stop`;

async function statusCommand(): Promise<Record<string, unknown>> {
  const identity = await getIdentity();
  const entries = (await get(`/workspaces/${identity.workspaceId}/user/${identity.userId}/time-entries`, {
    "in-progress": "true",
  })) as Array<Record<string, unknown>>;
  if (!Array.isArray(entries) || entries.length === 0) return { running: "none" };
  return { running: entries[0] };
}

async function startCommand(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseFlags(args, {
    value: ["project", "task", "tag", "start"],
    boolean: ["billable"],
  });
  const description = flags.positionals.join(" ").trim();
  const identity = await getIdentity();
  const tagIds = many(flags, "tag");

  await post(`/workspaces/${identity.workspaceId}/time-entries`, {
    start: one(flags, "start") ?? new Date().toISOString(),
    ...(description ? { description } : {}),
    ...(one(flags, "project") ? { projectId: one(flags, "project") } : {}),
    ...(one(flags, "task") ? { taskId: one(flags, "task") } : {}),
    ...(tagIds ? { tagIds } : {}),
    ...(flags.booleans.has("billable") ? { billable: true } : {}),
  });
  return { started: description || "(no description)", help: ["clockify-axi timer status", "clockify-axi timer stop"] };
}

async function stopCommand(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseFlags(args, { value: ["end"] });
  const identity = await getIdentity();

  const stopped = await patch(`/workspaces/${identity.workspaceId}/user/${identity.userId}/time-entries`, {
    end: one(flags, "end") ?? new Date().toISOString(),
  });
  return { stopped };
}

export async function timerCommand(args: string[]): Promise<Record<string, unknown>> {
  const [sub, ...rest] = args;
  if (sub === "status" || sub === undefined) return statusCommand();
  if (sub === "start") return startCommand(rest);
  if (sub === "stop") return stopCommand(rest);
  throw usageError(`Unknown timer target "${sub}"`, ["Valid targets: status, start, stop", "Run `clockify-axi timer --help`"]);
}
