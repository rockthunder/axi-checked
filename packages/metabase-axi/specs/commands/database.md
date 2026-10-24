# Command: database (`db`)

Database listing and **schema introspection** — the Tier-1 capability the MCP server
lacked. Command alias: `db`.

## Invocation

```
metabase-axi db list [--instance <name>]
metabase-axi db schema <id|name> [flags]
```

`schema` flags: `--table <name>` (filter to one table), `--search <substr>` (filter
tables/fields by substring), `--instance <name>`.

## Data Requirements

- `list` → `GET /api/database` (normalize `{data:[…]}` vs array across versions).
- `schema` → `GET /api/database/:id/metadata` — tables → fields with types.

## Display Rules

- `list`: `databases[N]{id,name,engine,tables}` — `tables` = count when available.
- `schema`: grouped by table. For each table a `table:` header (`name`, `schema`, field
  count) then `fields[N]{name,base_type,semantic_type}`. `semantic_type` flags PK/FK/etc.
  Capped per [output-rendering](../behaviors/output-rendering.md); large schemas suggest
  `--table`/`--search` in `help[]`, or `--json-out` to dump the full metadata to a file.
- **Descriptions:** Metabase table/field annotations (`description`) are surfaced when
  present — a `description` column is added to the table overview / field listing / search
  matches only if at least one item in that set has one (omitted entirely when none do, to
  preserve the token budget). `--search` also matches against description text, so a column
  can be found by its documented meaning, not just its name.
- Output is shaped to be **directly usable for writing the next `query`** (real field names
  - types, no prose).

## Actions

Read-only. Default profile is acceptable (not expensive).

## Navigation

- `db schema <id>` → `query --db <id> "SELECT …"` using the discovered field names.
- `search <q>` to locate a table across databases.

## Principles

**Inherited:**

- [Schema before query](../principles.md#schema-before-query) — this command is the
  primary expression of that principle; its output exists to make `query` correct.
