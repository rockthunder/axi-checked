<h1 align="center">metabase-axi</h1>

<p align="center">An <a href="https://axi.md">AXI</a>-compliant CLI for <a href="https://www.metabase.com/">Metabase</a> — built for agents.</p>

`metabase-axi` wraps the Metabase HTTP API in an agent-ergonomic CLI: token-efficient
[TOON](https://toonformat.dev/) output, schema introspection so you can write correct
queries, capped result previews with full-data export to a file, and named instance
profiles so you never query the wrong deployment by accident.

It leads with the **analyst** workflow — run SQL/MBQL, execute saved questions, introspect
schema, search content, and browse dashboards/collections from the terminal.

> Status: early development (Tier 1 — query & explore — is shipped; see the
> [Roadmap](#roadmap)). The spec is the source of truth — see [`specs/`](specs/) — and
> work-in-flight is tracked in [`plans/`](plans/). Built with [specops](https://github.com/JarvusInnovations/specops).

## Install

```sh
npm install -g metabase-axi      # or: bun add -g metabase-axi
```

## Setup

```sh
metabase-axi auth add prod --url https://metabase.example.org --api-key mb_...
```

Mint an API key in Metabase admin (Settings → API keys). Credentials are stored in
`~/.config/metabase-axi/config.json`; `METABASE_URL` + `METABASE_API_KEY` (or
`METABASE_USERNAME`/`METABASE_PASSWORD`) override the file for CI/cron. Verify with
`metabase-axi doctor`.

## Commands

| Command | What |
|---|---|
| `metabase-axi` | Home view: active instance + recent content + suggestions |
| `metabase-axi query <sql>` | Run native SQL or MBQL; preview + export |
| `metabase-axi card list\|view\|run` | List, inspect, and execute saved questions |
| `metabase-axi db list\|schema` | List databases; introspect tables/fields |
| `metabase-axi search <q>` | Find cards, dashboards, collections, tables |
| `metabase-axi dashboard list\|view` | List and inspect dashboards |
| `metabase-axi collection list` | Browse the collection tree |
| `metabase-axi auth\|doctor` | Credentials + health |
| `metabase-axi setup hooks` | Install the SessionStart ambient hook |

Run `metabase-axi --help` for the full command list, or `metabase-axi <command> --help` for
any command's usage.

## Roadmap

Capability is rolled out in tiers, analyst-first. Reads come before writes by design —
see [`specs/principles.md`](specs/principles.md).

| Tier | Scope | Status |
|---|---|---|
| **1 — Query & explore** | Run SQL/MBQL, execute & inspect saved questions, schema introspection (incl. table/field descriptions), search, browse dashboards & collections, export to file | ✅ Shipped |
| **2 — Authoring** | Create & edit cards, dashboards, and collections | 🔜 Planned |
| **3 — Operations** | Users, permission groups, settings, instance health/audit | 🔜 Planned |
| **4 — Deferred** | Pulses/alerts, public & embed links, comments, timelines, revisions, Enterprise endpoints | ⏳ Later |

All write operations (Tier 2+) mutate a shared, often production instance — they land
deliberately, behind explicit instance selection. See
[`specs/architecture.md`](specs/architecture.md#command-surface--roadmap) for the full surface.

## Development

```sh
asdf install          # bun + nodejs per .tool-versions
bun install
bun run build         # tsc -> dist/
bun run test          # vitest
bun run dev -- query "SELECT 1"   # run from source
```

## License

MIT © Jarvus Innovations
