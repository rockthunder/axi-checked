---
status: done
depends: [config-and-auth, output-foundation]
specs:
  - specs/commands/database.md
  - specs/commands/search.md
  - specs/commands/collection.md
  - specs/api/conventions.md
issues: []
---

# Plan: discovery — db schema, search, collections

## Scope

The "find and understand the data" commands. In: `src/metabase/{database,search,collection}.ts`
clients and `src/commands/{database,search,collection}.ts`. Centerpiece is `db schema`
(schema introspection — the MCP gap). Out: card/dashboard listing (next plan).

## Implements

- `specs/commands/database.md` — `db list`, `db schema <id|name>` with `--table`/`--search`
  filters; output usable directly for writing a query.
- `specs/commands/search.md` — `search <q>` with `--type`, model-discriminated results.
- `specs/commands/collection.md` — `collection list` with `--parent`/`--namespace`.

## Approach

1. `database.ts`: `listDatabases()` (normalize shape); `databaseMetadata(id)` → tables→fields.
   `db schema` groups by table, renders `fields[]{name,base_type,semantic_type}`, filters by
   `--table`/`--search`, offers `--json-out` for full metadata.
2. `search.ts`: `search(q, models)` → `GET /api/search`; render `results[]{model,id,name,
   collection}`; route `help[]` to the per-model viewer.
3. `collection.ts`: `listCollections(ns)` → derive `parent` from `location`; `--parent`
   scopes to direct children.

## Validation

- [x] `db list` shows id/name/engine. (Table count isn't in the list endpoint — "when
      available" per the spec — so it's omitted; `db schema` carries per-table field counts.)
- [x] `db schema <id>` lists tables with fields + base/semantic types; `--table`/`--search`
      filter correctly; large schema suggests narrowing + `--json-out`. (Verified live on a
      18-table db: overview, `--table` field list with PK/Category semantics, `--search`
      column finder, `--json-out` dump.)
- [x] `search "<term>"` returns mixed models with correct discriminators; `--type` filters;
      empty results give a definitive `0 results` message (empty *query* is a validation error).
- [x] `collection list` shows the tree flatly; `--parent <id>` scopes to children + echoes
      parent. (Verified live on 46 collections; parent derived from `location`.)
- [x] All three echo the resolved `instance:` and stay within token caps.

## Risks / unknowns

- **Metadata size** — big databases produce huge metadata; rely on caps + `--table`/`--json-out`.
- **Search model coverage** — confirm which `model` values the target Metabase version
  returns.

## Notes

- Shipped directly to `main` (no PR; pre-v1).
- `db schema` has three modes: default = `tables[]{name,schema,fields-count}` overview;
  `--table <name>` = that table's `fields[]{name,type,semantic}`; `--search <substr>` =
  cross-table `matches[]{table,name,type,semantic}` column finder. `--search` matches field
  names/display only (table-name matches are `--table`'s job) — refined after live testing.
- `--json-out` on `db schema` dumps the full metadata; csv/xlsx are rejected (JSON only).
- `--type` on `search` takes a comma-separated model list (not repeated flags), since the
  flag parser keeps one value per flag.
- Live `search` returned `table` and `card` models with collection names; `collection list`
  surfaced the root as id `"root"`.

## Follow-ups

- None.
