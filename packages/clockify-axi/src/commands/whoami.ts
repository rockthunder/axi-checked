import { parseFlags } from "../flags.js";
import { getIdentity } from "../identity.js";

export const WHOAMI_HELP = `clockify-axi whoami [flags]

Show the cached Clockify identity (user, active workspace, time zone) used
as the default \`workspaceId\`/\`userId\` for every other command.

Flags:
  --refresh    Re-fetch from Clockify instead of using the cache

Examples:
  clockify-axi whoami
  clockify-axi whoami --refresh`;

export async function whoamiCommand(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseFlags(args, { boolean: ["refresh"] });
  const identity = await getIdentity(flags.booleans.has("refresh"));
  return {
    userId: identity.userId,
    workspaceId: identity.workspaceId,
    timeZone: identity.timeZone ?? "",
    weekStart: identity.weekStart ?? "",
    workspaces: (identity.workspaces ?? []).map((w) => `${w.id} (${w.name})`).join(", "),
    cached: identity.updatedAt,
    help: ["Every command below defaults --workspace and --user from this cache; pass --refresh if you switched workspaces in Clockify"],
  };
}
