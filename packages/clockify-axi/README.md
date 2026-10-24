# clockify-axi

Clockify's REST API for agents, built to the [AXI](https://axi.md) conventions.

Wraps [Clockify's REST API](https://docs.clockify.me/) (`api.clockify.me/api/v1` and the separate `reports.api.clockify.me/v1`) with TOON output, a cached workspace/user identity, and exit codes you can gate on.

## Why

Clockify's own MCP server is built for a chat client and only exposes 13 tools.
`clockify-axi` talks to the full REST API instead, and closes the same gaps a shell script would otherwise hit:

| Raw Clockify REST API | clockify-axi |
| --- | --- |
| Every endpoint needs `workspaceId`, most need `userId`, resolved by calling `GET /user` first | Resolves them once and caches them, so every other command just works |
| Named report ranges (THIS_WEEK, LAST_MONTH) don't exist - reports take raw `dateRangeStart`/`dateRangeEnd` | Computes them from the user's real `weekStart` setting |
| `X-Api-Key` header repeated on every call | Read once from `CLOCKIFY_API_KEY` |
| No exit codes - just HTTP status | Exit `0` success, `1` error, `2` usage error |

## Install

```sh
npm install -g clockify-axi
```

Or run it with no install at all: `npx -y clockify-axi`.

Install the skill so agents reach for it on their own:

```sh
npx skills add ./skills/clockify-axi -g
```

Optional ambient context in every agent session:

```sh
clockify-axi setup hooks
```

## Usage

```sh
export CLOCKIFY_API_KEY=<key>          # Clockify -> Preferences -> Advanced -> Manage API keys
clockify-axi                           # home: cached identity, next steps
clockify-axi whoami                    # resolve and cache workspaceId/userId
clockify-axi timer status              # what's running right now
clockify-axi timer start "Client call" --project <id> --billable
clockify-axi timer stop
clockify-axi log 2026-09-15T09:00:00Z 2026-09-15T10:30:00Z Client call --project <id>
clockify-axi report summary --range THIS_WEEK
clockify-axi report summary --range LAST_MONTH --group CLIENT
clockify-axi report detail --range THIS_WEEK --project <id>
clockify-axi clients list
clockify-axi projects list --client <id>
clockify-axi projects create "New Site Build" --billable
clockify-axi tasks list --project <id>
clockify-axi tags list
clockify-axi update --check
```

Some workspaces require every time entry to carry a project and/or task.
If `timer stop` or `log` fails, Clockify's own error message says which
field is missing - pass `--project`/`--task` to satisfy it.

## AXI compliance

Exit codes follow the spec: `0` success, `1` error, `2` usage error.

## Environment

| Variable | Effect |
| --- | --- |
| `CLOCKIFY_API_KEY` | Required. API key from Clockify's Advanced preferences |
| `CLOCKIFY_API_BASE` | Override the REST API base (default `https://api.clockify.me/api/v1`) |
| `CLOCKIFY_REPORTS_API_BASE` | Override the Reports API base (default `https://reports.api.clockify.me/v1`) |
| `XDG_CACHE_HOME` | Where the cached identity is stored (default `~/.cache/clockify-axi`) |

## Development

```sh
npm install
npm test
npm run build
npm run dev -- timer status
```

## License

MIT
