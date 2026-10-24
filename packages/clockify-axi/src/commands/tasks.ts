import { usageError } from "../usage.js";
import { one, parseFlags } from "../flags.js";
import { get, post } from "../rest.js";
import { getIdentity } from "../identity.js";

export const TASKS_HELP = `clockify-axi tasks <list|create> --project <id> [args]

  tasks list --project <id> [query]     Search tasks by name
  tasks create --project <id> <name>    Add a new task

Examples:
  clockify-axi tasks list --project 671...e56
  clockify-axi tasks list --project 671...e56 design
  clockify-axi tasks create --project 671...e56 "AR Box"`;

async function listCommand(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseFlags(args, { value: ["project"] });
  const projectId = one(flags, "project");
  if (!projectId) throw usageError("tasks list requires --project <id>", ["clockify-axi projects list  # to find the ID"]);
  const name = flags.positionals.join(" ").trim();
  const identity = await getIdentity();

  const tasks = (await get(`/workspaces/${identity.workspaceId}/projects/${projectId}/tasks`, {
    ...(name ? { name } : {}),
  })) as Array<{ id: string; name: string }>;

  if (!Array.isArray(tasks) || tasks.length === 0) return { count: 0, tasks: "none" };
  return { count: tasks.length, tasks };
}

async function createCommand(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseFlags(args, { value: ["project"] });
  const projectId = one(flags, "project");
  if (!projectId) throw usageError("tasks create requires --project <id>", ["clockify-axi projects list  # to find the ID"]);
  const name = flags.positionals.join(" ").trim();
  if (!name) throw usageError("tasks create requires a task name", ['clockify-axi tasks create --project 671...e56 "AR Box"']);
  const identity = await getIdentity();

  const created = await post(`/workspaces/${identity.workspaceId}/projects/${projectId}/tasks`, { name });
  return { created, help: [`clockify-axi tasks list --project ${projectId} ${name}`] };
}

export async function tasksCommand(args: string[]): Promise<Record<string, unknown>> {
  const [sub, ...rest] = args;
  if (sub === "list" || sub === undefined) return listCommand(sub === undefined ? args : rest);
  if (sub === "create") return createCommand(rest);
  throw usageError(`Unknown tasks target "${sub}"`, ["Valid targets: list, create", "Run `clockify-axi tasks --help`"]);
}
