import { usageError } from "../usage.js";
import { parseFlags } from "../flags.js";
import { get } from "../rest.js";
import { getIdentity } from "../identity.js";

export const TAGS_HELP = `clockify-axi tags list [query]

Search tags by name to resolve tag IDs for \`timer start --tag\` and \`log --tag\`.

Examples:
  clockify-axi tags list
  clockify-axi tags list bug-fix`;

async function listCommand(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseFlags(args, {});
  const name = flags.positionals.join(" ").trim();
  const identity = await getIdentity();

  const tags = (await get(`/workspaces/${identity.workspaceId}/tags`, {
    ...(name ? { name } : {}),
  })) as Array<{ id: string; name: string }>;

  if (!Array.isArray(tags) || tags.length === 0) return { count: 0, tags: "none" };
  return { count: tags.length, tags };
}

export async function tagsCommand(args: string[]): Promise<Record<string, unknown>> {
  const [sub, ...rest] = args;
  if (sub === "list" || sub === undefined) return listCommand(sub === undefined ? args : rest);
  throw usageError(`Unknown tags target "${sub}"`, ["Valid targets: list", "Run `clockify-axi tags --help`"]);
}
