import { usageError } from "../usage.js";
import { many, one, parseFlags } from "../flags.js";
import { get, post } from "../rest.js";
import { getIdentity } from "../identity.js";

export const PROJECTS_HELP = `clockify-axi projects <list|create> [args] [flags]

  projects list [query] [--client <id>...]     Search projects by name/client
  projects create <name> [flags]               Add a new project
    --client <id>         Client ID
    --color <#rrggbb>    Project color
    --billable            Mark billable
    --public              Mark visible to all workspace members
    --note <text>         Project note

Examples:
  clockify-axi projects list
  clockify-axi projects list --client 671...d3f
  clockify-axi projects create "New Site Build" --billable --color "#3399ff"`;

interface Project {
  id: string;
  name: string;
  clientId?: string;
  clientName?: string;
  color: string;
  billable: boolean;
  archived: boolean;
}

async function listCommand(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseFlags(args, { value: ["client"] });
  const name = flags.positionals.join(" ").trim();
  const identity = await getIdentity();
  const clients = many(flags, "client");

  const projects = (await get(`/workspaces/${identity.workspaceId}/projects`, {
    ...(name ? { name } : {}),
    ...(clients ? { clients: clients.join(",") } : {}),
  })) as Project[];

  if (!Array.isArray(projects) || projects.length === 0) return { count: 0, projects: "none" };
  return {
    count: projects.length,
    projects: projects.map((p) => ({ id: p.id, name: p.name, clientName: p.clientName ?? "", billable: p.billable, archived: p.archived })),
  };
}

async function createCommand(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseFlags(args, { value: ["color", "note", "client"], boolean: ["billable", "public"] });
  const name = flags.positionals.join(" ").trim();
  if (!name) throw usageError("projects create requires a project name", ['clockify-axi projects create "New Site Build"']);
  const identity = await getIdentity();

  const created = await post(`/workspaces/${identity.workspaceId}/projects`, {
    name,
    ...(one(flags, "color") ? { color: one(flags, "color") } : {}),
    ...(one(flags, "note") ? { note: one(flags, "note") } : {}),
    ...(one(flags, "client") ? { clientId: one(flags, "client") } : {}),
    ...(flags.booleans.has("billable") ? { billable: true } : {}),
    ...(flags.booleans.has("public") ? { isPublic: true } : {}),
  });

  return { created, help: [`clockify-axi projects list ${name}`] };
}

export async function projectsCommand(args: string[]): Promise<Record<string, unknown>> {
  const [sub, ...rest] = args;
  if (sub === "list" || sub === undefined) return listCommand(sub === undefined ? args : rest);
  if (sub === "create") return createCommand(rest);
  throw usageError(`Unknown projects target "${sub}"`, ["Valid targets: list, create", "Run `clockify-axi projects --help`"]);
}
