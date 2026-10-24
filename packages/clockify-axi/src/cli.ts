import { installSessionStartHooks, runAxiCli } from "axi-sdk-js";
import { CLIENTS_HELP, clientsCommand } from "./commands/clients.js";
import { LOG_HELP, logCommand } from "./commands/log.js";
import { PROJECTS_HELP, projectsCommand } from "./commands/projects.js";
import { REPORT_HELP, reportCommand } from "./commands/report.js";
import { TAGS_HELP, tagsCommand } from "./commands/tags.js";
import { TASKS_HELP, tasksCommand } from "./commands/tasks.js";
import { TIMER_HELP, timerCommand } from "./commands/timer.js";
import { WHOAMI_HELP, whoamiCommand } from "./commands/whoami.js";
import { TOP_LEVEL_HELP } from "./help.js";
import { getIdentity } from "./identity.js";
import { usageError } from "./usage.js";
import { VERSION } from "./version.js";

const DESCRIPTION = "Track time, run reports, and manage Clockify projects for agents";

const SETUP_HELP = `clockify-axi setup hooks

Install a SessionStart hook for Claude Code, Codex and OpenCode so every agent
session starts with clockify-axi's commands in context.`;

async function homeOutput(): Promise<Record<string, unknown>> {
  let identity: Awaited<ReturnType<typeof getIdentity>> | undefined;
  try {
    identity = await getIdentity();
  } catch {
    // No key yet, or the profile call failed - home still shows usable next steps.
  }
  return {
    identity: identity
      ? { userId: identity.userId, workspaceId: identity.workspaceId, timeZone: identity.timeZone ?? "" }
      : "none - run `clockify-axi whoami` once CLOCKIFY_API_KEY is set",
    help: [
      "clockify-axi timer status",
      "clockify-axi report summary --range THIS_WEEK",
      "clockify-axi --help",
    ],
  };
}

const COMMAND_HELP: Record<string, string> = {
  whoami: WHOAMI_HELP,
  timer: TIMER_HELP,
  log: LOG_HELP,
  report: REPORT_HELP,
  clients: CLIENTS_HELP,
  projects: PROJECTS_HELP,
  tasks: TASKS_HELP,
  tags: TAGS_HELP,
  setup: SETUP_HELP,
};

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  await runAxiCli({
    description: DESCRIPTION,
    version: VERSION,
    argv,
    topLevelHelp: TOP_LEVEL_HELP,
    getCommandHelp: (command) => COMMAND_HELP[command],
    home: () => homeOutput(),
    commands: {
      whoami: (args) => whoamiCommand(args),
      timer: (args) => timerCommand(args),
      log: (args) => logCommand(args),
      report: (args) => reportCommand(args),
      clients: (args) => clientsCommand(args),
      projects: (args) => projectsCommand(args),
      tasks: (args) => tasksCommand(args),
      tags: (args) => tagsCommand(args),
      setup: async (args) => {
        if (args.length !== 1 || args[0] !== "hooks") {
          throw usageError(`Unknown setup target "${args[0] ?? ""}"`, ["Run `clockify-axi setup hooks`"]);
        }
        await installSessionStartHooks({ marker: "clockify-axi", binaryNames: ["clockify-axi"] });
        return {
          setup: "hooks installed or already up to date",
          help: ["Restart your agent session for the hook to take effect"],
        };
      },
    },
  });
}
