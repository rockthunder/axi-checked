---
name: metabase-axi
description: "AXI-compliant CLI for Metabase — query and explore a Metabase instance from the terminal with token-efficient TOON output. Use when the user wants to run SQL/MBQL against Metabase, execute or inspect saved questions (cards), introspect database schema (tables/fields/types), search Metabase content, browse dashboards/collections, or export query results to a file. Prefer this over raw Metabase API calls."
user-invocable: false
author: Jarvus Innovations
metadata:
  hermes:
    tags: [metabase, analytics, sql, bi, devops]
    category: data
---

# metabase-axi

Agent-ergonomic CLI over the Metabase HTTP API. Run `metabase-axi --help` for the command
list and `metabase-axi <command> --help` for any command's usage.

## Setup

```sh
metabase-axi auth add <name> --url https://metabase.example.org --api-key <key>
metabase-axi doctor   # verify
```

`METABASE_URL` + `METABASE_API_KEY` (or `METABASE_USERNAME`/`METABASE_PASSWORD`) override the
stored config for CI/one-offs. Multiple instances are named profiles; select with
`--instance <name>`.

## Core workflow

1. `metabase-axi db list` — find a database id.
2. `metabase-axi db schema <id>` — see tables; `--table <name>` for fields, `--search <substr>`
   to find columns (names + types). **Do this before writing SQL.**
3. `metabase-axi query "SELECT …" --db <id>` — run native SQL (or `--mbql <json>`, or `-` for
   stdin). Results preview is capped; add `--json-out` / `--csv-out` / `--xlsx-out` to write
   the full result to a file (a `jq` hint is printed for JSON).
4. `metabase-axi search "<q>"` — locate cards/dashboards/tables by name.
5. `metabase-axi card list|view|run <id>` — list, inspect, or execute saved questions.
6. `metabase-axi dashboard list|view <id>`, `metabase-axi collection list` — browse.

## Notes

- Reads are safe; ad-hoc `query` and `card run` are potentially expensive and require an
  explicit `--instance` when multiple profiles exist (never guesses the target).
- Output is TOON. Long results truncate with an explicit marker — use the `*-out` flags for
  the complete data rather than widening the preview.
- This tool is read/query-focused (Tier 1). Creating or editing cards/dashboards is not yet
  supported.
