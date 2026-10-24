export const TOP_LEVEL_HELP = `clockify-axi - Clockify's REST API for agents (AXI)

Run with no arguments for the home view: the cached identity and suggested
next steps.

commands[10]{command,what}:
  whoami,Show the cached user/workspace identity
  timer,Check, start, or stop the running timer
  log,Log a completed (past) time entry
  report,Fetch summary or detailed time tracking reports
  clients,Search clients
  projects,Search or create projects
  tasks,Search or create tasks within a project
  tags,Search tags
  setup,Install SessionStart hooks for Claude Code, Codex and OpenCode
  update,Self-update to the latest release

Flags:
  --help                 This index; \`clockify-axi <command> --help\` for details
  -v, --version          Print the version

Examples:
  clockify-axi whoami
  clockify-axi timer start "Client call" --project 671...e56 --billable
  clockify-axi report summary --range THIS_WEEK
  clockify-axi log 2026-09-15T09:00:00Z 2026-09-15T10:30:00Z Client call

Notes:
  workspaceId and userId are resolved once from \`GET /user\` and cached;
  every other command uses the cache automatically. Run
  \`clockify-axi whoami --refresh\` after switching workspaces in Clockify.

Exit codes:
  0 success  1 error  2 usage error

Env:
  CLOCKIFY_API_KEY          Required. Clockify → Preferences → Advanced → Manage API keys
  CLOCKIFY_API_BASE         Override the REST API base (default: https://api.clockify.me/api/v1)
  CLOCKIFY_REPORTS_API_BASE Override the Reports API base (default: https://reports.api.clockify.me/v1)`;
