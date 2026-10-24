import { usageError } from "../usage.js";
import { parseFlags } from "../flags.js";
import { get } from "../rest.js";
import { getIdentity } from "../identity.js";

export const CLIENTS_HELP = `clockify-axi clients list [query]

Search clients by name to resolve a client ID for \`projects list --client\`.

Examples:
  clockify-axi clients list
  clockify-axi clients list Acme`;

async function listCommand(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseFlags(args, {});
  const name = flags.positionals.join(" ").trim();
  const identity = await getIdentity();

  const clients = (await get(`/workspaces/${identity.workspaceId}/clients`, {
    ...(name ? { name } : {}),
  })) as Array<{ id: string; name: string }>;

  if (!Array.isArray(clients) || clients.length === 0) return { count: 0, clients: "none" };
  return { count: clients.length, clients };
}

export async function clientsCommand(args: string[]): Promise<Record<string, unknown>> {
  const [sub, ...rest] = args;
  if (sub === "list" || sub === undefined) return listCommand(sub === undefined ? args : rest);
  throw usageError(`Unknown clients target "${sub}"`, ["Valid targets: list", "Run `clockify-axi clients --help`"]);
}
