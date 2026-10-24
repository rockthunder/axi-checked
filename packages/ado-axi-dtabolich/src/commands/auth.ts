import { AxiError } from "../errors.js";
import type { AdoContext } from "../context.js";
import { orgUrl } from "../context.js";
import { azJson, azText } from "../az.js";

export const AUTH_HELP = `usage: ado-axi auth <subcommand>
subcommands[1]:
  status
flags{status}:
  (none)
examples:
  ado-axi auth status
`;

export async function authCommand(
  args: string[],
  ctx?: AdoContext,
): Promise<Record<string, unknown>> {
  const sub = args[0];
  if (sub !== "status") {
    throw new AxiError("Unknown auth subcommand", "VALIDATION_ERROR", [
      "Run `ado-axi auth status`",
    ]);
  }

  let account: { name?: string; user?: { name?: string } } | undefined;
  try {
    account = await azJson(["account", "show"]);
  } catch {
    account = undefined;
  }

  let defaults: { organization?: string; project?: string } = {};
  try {
    const raw = await azText(["devops", "configure", "--list"]);
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*(organization|project)\s*=\s*(.+)\s*$/i);
      if (m) {
        defaults[m[1].toLowerCase() as "organization" | "project"] = m[2];
      }
    }
  } catch {
    defaults = {};
  }

  return {
    auth: {
      azure_cli_user: account?.user?.name ?? account?.name ?? null,
      logged_in: Boolean(account),
      default_organization: defaults.organization ?? null,
      default_project: defaults.project ?? null,
      resolved_org: ctx?.org ? orgUrl(ctx.org) : null,
      resolved_project: ctx?.project ?? null,
      resolved_repo: ctx?.repo ?? null,
    },
    help: [
      "Authenticate with `az login`",
      "Optionally `az devops login --organization https://dev.azure.com/<org>`",
      "Set defaults with `az devops configure -d organization=... project=...`",
    ],
  };
}
