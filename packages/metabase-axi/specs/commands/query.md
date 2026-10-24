# Command: query

## Invocation

```
metabase-axi query <sql>            # native SQL string
metabase-axi query -                # read native SQL from stdin
metabase-axi query --mbql <json>    # structured MBQL query
metabase-axi query <sql> [flags]
```

Flags:

- `--instance <name>` — target profile (required when ambiguous; see below).
- `--db <id|name>` — database to run against. Required for native SQL unless the profile
  has a single database or a configured default db.
- `--mbql <json>` — run a structured MBQL query instead of native SQL.
- `--limit <n>` — preview row cap override (default `PREVIEW_ROW_CAP` = 20).
- `--json-out[=<path>]` / `--csv-out[=<path>]` / `--xlsx-out[=<path>]` — full export to a
  file (see [result-export-and-truncation](../behaviors/result-export-and-truncation.md)).
- `--params <json>` — parameters/template-tag values for parameterized SQL.

## Data Requirements

Executes an **ad-hoc** query via `POST /api/dataset` (never persists anything). Body is a
[dataset query](../data-model.md#dataset-query): native (`{database,type:"native",native}`)
or MBQL (`{database,type:"query",query}`). Exports go through `POST /api/dataset/:format`.
See [api/conventions.md](../api/conventions.md#query--data-endpoints-tier-1-core).

## Display Rules

Per [output-rendering](../behaviors/output-rendering.md) and
[result-export-and-truncation](../behaviors/result-export-and-truncation.md):

- Lead with `instance:`, `database:`, `rows: <shown> of <total>`, `time: <ms>`.
- A TOON table of up to `--limit` rows, with `cols` showing name + base type.
- For MBQL, surface the compiled SQL (`native_form`) when present.
- On `status: "failed"`, raise `QUERY_ERROR` with the server's error text verbatim.
- When a `*-out` flag is used, add `wrote:`, `columns:`, and a `jq` `help[]` line.

## Actions

- Runs a query. **Read-only** (no Metabase state changes), but **potentially expensive**:
  [Never guess which instance](../principles.md#never-guess-which-instance) applies — with
  2+ profiles and no explicit `--instance`/env, the command **stops** and asks rather than
  using the default ([instance-resolution](../behaviors/instance-resolution.md)).

## Navigation

- `db list` / `db schema <id>` — discover databases, tables, fields to write the query.
- `card list` — find an existing saved question instead of writing SQL.
- After a result: `help[]` suggests `--json-out`/`--csv-out` for full data, `--limit` for more rows, and
  `db schema` if a column was unexpected.

## Principles

**Inherited:**

- [Schema before query](../principles.md#schema-before-query) — `query` and `db schema`
  are designed together; result columns always carry types.
- [Preview to stdout, full data to a file](../principles.md#preview-to-stdout-full-data-to-a-file).
- [Never guess which instance](../principles.md#never-guess-which-instance).
