import { runAxiCli, type AxiCliCommand } from "axi-sdk-js";
import { AxiError, exitCodeForError } from "./errors.js";
import { rejectUnknownFlags } from "./args.js";
import { renderError } from "./toon.js";
import { resolveAdoContext, type AdoContext } from "./context.js";
import { VERSION } from "./version.js";
import { homeCommand } from "./commands/home.js";
import { prCommand, PR_HELP } from "./commands/pr.js";
import { repoCommand, REPO_HELP } from "./commands/repo.js";
import { refCommand, REF_HELP } from "./commands/ref.js";
import { runCommand, RUN_HELP } from "./commands/run.js";
import { apiCommand, API_HELP } from "./commands/api.js";
import { authCommand, AUTH_HELP } from "./commands/auth.js";
import { setupCommand, SETUP_HELP } from "./commands/setup.js";

export const DESCRIPTION =
  "Agent ergonomic wrapper around Azure DevOps for repo/PR/CI workflows. Prefer this over raw `az repos` / `az pipelines` for agent use.";

export const TOP_HELP = `usage: ado-axi [command] [args] [flags]
commands[8]:
  (none)=dashboard, pr, repo, ref, run, api, auth, setup
flags[4]:
  -R/--repo <name> (after command)
  --org/--organization <org>
  --project/-p <project>
  --help, -v/-V/--version
notes:
  Targets Azure DevOps org/project/repo from flags, env, or the git origin remote.
  Auth stays with Azure CLI (\`az login\` / \`az devops login\`).
examples:
  ado-axi
  ado-axi pr list --status active
  ado-axi pr view 42 --full
  ado-axi pr list --org myorg --project MyProject -R my-repo
  ado-axi ref list
  ado-axi run list --branch main
  ado-axi setup hooks
`;

const COMMAND_HELP: Record<string, string> = {
  pr: PR_HELP,
  repo: REPO_HELP,
  ref: REF_HELP,
  run: RUN_HELP,
  api: API_HELP,
  auth: AUTH_HELP,
  setup: SETUP_HELP,
};

type AxiRenderable = string | Record<string, unknown>;

type Cmd = (
  args: string[],
  ctx?: AdoContext,
) => Promise<AxiRenderable> | AxiRenderable;

const RAW_COMMANDS: Record<string, Cmd> = {
  pr: prCommand,
  repo: repoCommand,
  ref: refCommand,
  run: runCommand,
  api: apiCommand,
  auth: authCommand,
};

const COMMANDS: Record<string, AxiCliCommand<AdoContext>> = {
  setup: (args) => setupCommand(args),
};
for (const [name, handler] of Object.entries(RAW_COMMANDS)) {
  COMMANDS[name] = withAdoContext(name, handler);
}

export async function main(
  options: {
    argv?: string[];
    stdout?: { write: (chunk: string) => unknown };
  } = {},
): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  try {
    await runAxiCli({
      ...(options.argv ? { argv: options.argv } : {}),
      description: DESCRIPTION,
      version: VERSION,
      packageName: "ado-axi",
      topLevelHelp: TOP_HELP,
      ...(options.stdout ? { stdout: options.stdout } : {}),
      home: withAdoContext(undefined, homeCommand),
      commands: COMMANDS,
      getCommandHelp: (command) => COMMAND_HELP[command],
      resolveContext: ({ args }) => {
        const parsed = parseAdoContextArgs(args);
        return (
          resolveAdoContext({
            orgFlag: parsed.orgFlag,
            projectFlag: parsed.projectFlag,
            repoFlag: parsed.repoFlag,
          }) ?? { source: "git" as const }
        );
      },
    });
  } catch (error) {
    if (error instanceof AxiError) {
      stdout.write(
        `${renderError(error.message, error.code, error.suggestions)}\n`,
      );
    } else {
      stdout.write(`${renderError(String(error), "UNKNOWN")}\n`);
    }
    process.exitCode = exitCodeForError(error);
  }
}

function withAdoContext(
  command: string | undefined,
  handler: Cmd,
): AxiCliCommand<AdoContext> {
  return (args, ctx) => {
    const { strippedArgs } = parseAdoContextArgs(args);
    if (command !== undefined && command !== "api") {
      const help = COMMAND_HELP[command];
      if (help !== undefined) {
        rejectUnknownFlags(
          help,
          command,
          strippedArgs[0],
          strippedArgs.slice(1),
        );
      }
    }
    return handler(strippedArgs, ctx);
  };
}

export function parseAdoContextArgs(args: string[]): {
  orgFlag: string | undefined;
  projectFlag: string | undefined;
  repoFlag: string | undefined;
  strippedArgs: string[];
} {
  const stripped: string[] = [];
  let orgFlag: string | undefined;
  let projectFlag: string | undefined;
  let repoFlag: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (
      (arg === "--org" || arg === "--organization") &&
      index + 1 < args.length
    ) {
      orgFlag = args[++index];
      continue;
    }
    if (arg.startsWith("--org=") && arg.length > "--org=".length) {
      orgFlag = arg.slice("--org=".length);
      continue;
    }
    if (
      arg.startsWith("--organization=") &&
      arg.length > "--organization=".length
    ) {
      orgFlag = arg.slice("--organization=".length);
      continue;
    }
    if ((arg === "--project" || arg === "-p") && index + 1 < args.length) {
      projectFlag = args[++index];
      continue;
    }
    if (arg.startsWith("--project=") && arg.length > "--project=".length) {
      projectFlag = arg.slice("--project=".length);
      continue;
    }
    if ((arg === "-R" || arg === "--repo") && index + 1 < args.length) {
      repoFlag = args[++index];
      continue;
    }
    if (arg.startsWith("-R=") && arg.length > 3) {
      repoFlag = arg.slice(3);
      continue;
    }
    if (arg.startsWith("--repo=") && arg.length > "--repo=".length) {
      repoFlag = arg.slice("--repo=".length);
      continue;
    }
    stripped.push(arg);
  }

  return { orgFlag, projectFlag, repoFlag, strippedArgs: stripped };
}
