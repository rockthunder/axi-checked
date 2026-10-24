# Architecture

Foundational tech and structure decisions for metabase-axi. This is the *concrete* layer
(stack, layout, surface map); the *value-judgment* layer is in [principles.md](principles.md).

## Tech stack

- **Language:** TypeScript (strict), ES modules, target ES2022 / `Node16` resolution.
- **Runtime:** Node.js ≥ 20; developed and run under bun. Pinned in `.tool-versions`
  (`bun` + `nodejs`) via `asdf`.
- **Framework:** [`axi-sdk-js`](https://www.npmjs.com/package/axi-sdk-js) (`^0.1.7`) —
  provides `runAxiCli`, `AxiError`, output rendering, and `installSessionStartHooks`.
- **Output:** [`@toon-format/toon`](https://toonformat.dev/) (`^2.3.0`) — TOON serialization.
- **HTTP:** native `fetch` (Node ≥ 20) — no axios dependency.
- **Build:** `tsc` → `dist/`. **Test:** `vitest`. **Lint/format:** prettier (+ eslint optional).
- **Distribution:** published MIT to npm as `metabase-axi`, registered in the AXI catalog,
  same as the rest of the family.

## Project layout

Mirrors the established `*-axi` layout (see `slack-axi`, `harvest-axi`):

```
metabase-axi/
├── bin/metabase-axi.ts        # #!/usr/bin/env node → imports & calls main()
├── src/
│   ├── cli.ts                 # main(): runAxiCli({...}) wiring + TOP_HELP
│   ├── meta.ts                # DESCRIPTION, readVersion()
│   ├── config.ts              # profiles, credential & instance resolution, paths
│   ├── output.ts              # TOON helpers (renderList, renderHelp, truncate, joinBlocks)
│   ├── metabase/              # API client layer (one module per resource group)
│   │   ├── client.ts          # fetch wrapper: base URL, auth headers, error mapping
│   │   ├── dataset.ts         # POST /api/dataset (+ export), parameter values
│   │   ├── card.ts            # /api/card, /api/card/:id, /api/card/:id/query
│   │   ├── database.ts        # /api/database, /api/database/:id/metadata
│   │   ├── search.ts          # /api/search
│   │   ├── dashboard.ts       # /api/dashboard
│   │   └── collection.ts      # /api/collection
│   └── commands/              # one file per command (home, auth, doctor, setup,
│       └── ...                #   query, card, database, search, dashboard, collection)
├── skills/metabase-axi/SKILL.md   # agent skill (built from CLI metadata)
├── specs/                     # this directory
├── plans/                     # work-in-flight DAG
├── package.json  tsconfig.json  .tool-versions  README.md  LICENSE
```

## CLI shape

Command-first, noun-verb: `metabase-axi <command> [verb] [args] [flags]`. Flags follow the
command. Bare invocation (no command) runs the **home** view. Wiring via `runAxiCli`:

```ts
runAxiCli({
  description: DESCRIPTION,
  version: readVersion(),
  topLevelHelp: TOP_HELP,
  home: (args) => homeCommand(args),
  commands: { auth, doctor, setup, query, card, db, search, dashboard, collection },
  getCommandHelp: (cmd) => COMMAND_HELP[cmd],
  resolveContext: ({ command, args }) => resolveContext(command, args),
});
```

`resolveContext` resolves the active instance + credentials lazily (only for commands that
need them — never for `--help`/`--version`/`setup`). See
[behaviors/instance-resolution.md](behaviors/instance-resolution.md) and
[behaviors/credential-resolution.md](behaviors/credential-resolution.md).

## Configuration & instances

- **Config dir:** `$METABASE_AXI_CONFIG_DIR`, else `$XDG_CONFIG_HOME/metabase-axi`, else
  `~/.config/metabase-axi/`. Config file: `config.json`.
- **Named profiles:** the config file holds one or more named instance profiles
  (e.g. `prod`, `staging`), each with a base URL, auth material, and a cached profile
  summary. One profile is the default. Selected per-command via `--instance <name>`.
- **Env override:** environment variables (`METABASE_URL` + `METABASE_API_KEY` /
  `METABASE_USERNAME`+`METABASE_PASSWORD`) take precedence over the config file, for
  CI/cron — matching the family's env-precedes-config convention. Resolution and
  precedence are specified in [credential-resolution](behaviors/credential-resolution.md).

## Authentication

- **Primary:** API key via the `X-API-Key` request header (stable, no expiry).
- **Fallback:** username/password → `POST /api/session` → session token cached and sent
  as the `X-Metabase-Session` header; re-authenticate transparently on `401`.
- Per-profile; resolved by [credential-resolution](behaviors/credential-resolution.md).

## Command surface & roadmap

Tiers reflect the locked prioritization (analyst-first). **Tier 0 + Tier 1 are the MVP**
and are specified in `commands/`. Tiers 2–4 are mapped here and get their own specs when
scheduled.

### Tier 0 — Foundation (specified)

| Command | Purpose |
|---|---|
| `home` (no args) | Content-first dashboard: active instance + recent cards/dashboards + suggestions |
| `auth` | Manage profiles & credentials (add/list/use/remove, login) |
| `doctor` | Health check: instance reachable, auth valid, source of creds |
| `setup` | Install SessionStart hooks |

### Tier 1 — Read & query MVP (specified)

| Command | Endpoint(s) | Purpose |
|---|---|---|
| `query <sql\|->` | `POST /api/dataset`, `/api/dataset/:format` | Run native SQL or MBQL; export |
| `card list\|view\|run` | `/api/card`, `/api/card/:id`, `/api/card/:id/query` | List/inspect/execute saved questions |
| `db list\|schema` | `/api/database`, `/api/database/:id/metadata` | List databases; introspect tables/fields |
| `search <q>` | `/api/search` | Find cards/dashboards/collections/tables |
| `dashboard list\|view` | `/api/dashboard`, `/api/dashboard/:id` | List & inspect dashboards |
| `collection list` | `/api/collection` | Browse the collection tree |

### Tier 2 — Authoring (roadmap)

Create/update cards, dashboards, collections (`POST`/`PUT`), idempotent fetch-modify-PUT.

### Tier 3 — Operations (roadmap)

Users (`/api/user`), permission groups & membership (`/api/permissions`), settings
(`/api/setting`), instance health/audit. Matches historical operator usage.

### Tier 4 — Defer

Pulses/alerts, public/embed links, comments, timelines, revisions, all Enterprise endpoints.

## Non-goals (initial)

- No local query-result caching beyond profile/schema metadata caches.
- No Enterprise-edition surface.
- No re-implementation of `gcloud`-level instance ops (backups, Cloud SQL) — those stay in
  runbooks; metabase-axi speaks only the Metabase HTTP API.
