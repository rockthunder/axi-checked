import { runAxiCli, type AxiCliOptions } from "axi-sdk-js";
import { DESCRIPTION, readVersion } from "./meta.js";
import { homeCommand } from "./commands/home.js";
import { authCommand, AUTH_HELP } from "./commands/auth.js";
import { doctorCommand, DOCTOR_HELP } from "./commands/doctor.js";
import { setupCommand, SETUP_HELP } from "./commands/setup.js";
import { queryCommand, QUERY_HELP } from "./commands/query.js";
import { cardCommand, CARD_HELP } from "./commands/card.js";
import { databaseCommand, DATABASE_HELP } from "./commands/database.js";
import { searchCommand, SEARCH_HELP } from "./commands/search.js";
import { dashboardCommand, DASHBOARD_HELP } from "./commands/dashboard.js";
import { collectionCommand, COLLECTION_HELP } from "./commands/collection.js";

export const TOP_HELP = `usage: metabase-axi [command] [args] [flags]
commands[10]:
  (none)=home, auth, doctor, setup, query, card, db, search, dashboard, collection
flags:
  --instance <name> (per-command), --help, -v/--version
examples:
  metabase-axi query "SELECT 1 AS n" --db 6
  metabase-axi db schema 6
  metabase-axi card run 42 --csv-out
  metabase-axi search "revenue"
  metabase-axi --help
  metabase-axi query --help
`;

const COMMAND_HELP: Record<string, string> = {
  auth: AUTH_HELP,
  doctor: DOCTOR_HELP,
  setup: SETUP_HELP,
  query: QUERY_HELP,
  card: CARD_HELP,
  db: DATABASE_HELP,
  search: SEARCH_HELP,
  dashboard: DASHBOARD_HELP,
  collection: COLLECTION_HELP,
};

/** Build the CLI options. Overrides (e.g. `argv`, `stdout`) let tests drive dispatch. */
export function cliOptions(overrides: Partial<AxiCliOptions> = {}): AxiCliOptions {
  return {
    description: DESCRIPTION,
    version: readVersion(),
    topLevelHelp: TOP_HELP,
    home: () => homeCommand(),
    commands: {
      auth: (args) => authCommand(args),
      doctor: (args) => doctorCommand(args),
      setup: (args) => setupCommand(args),
      query: (args) => queryCommand(args),
      card: (args) => cardCommand(args),
      db: (args) => databaseCommand(args),
      search: (args) => searchCommand(args),
      dashboard: (args) => dashboardCommand(args),
      collection: (args) => collectionCommand(args),
    },
    getCommandHelp: (command) => COMMAND_HELP[command],
    ...overrides,
  };
}

export async function main(): Promise<void> {
  await runAxiCli(cliOptions());
}
