# Data model

The Metabase entities metabase-axi works with, and the result shapes commands return.
This is Metabase's own vocabulary, used faithfully (see
[principles.md#surface-the-contract-dont-hide-metabase](principles.md#surface-the-contract-dont-hide-metabase)).

## Local entities

### Instance profile

A named, locally-stored target Metabase deployment.

| Field | Meaning |
|---|---|
| `name` | Profile name (`prod`, `staging`, …); used with `--instance`. |
| `url` | Base URL, e.g. `https://metabase.example.org`. |
| `auth` | `{ api_key }` (primary) or `{ username, password }` (session fallback). |
| `session` | Cached `X-Metabase-Session` token + obtained-at (fallback auth only). |
| `cache` | Cached summary: server version, current-user name, db count, cached-at. |

The default profile name is stored at config top level. See
[behaviors/instance-resolution.md](behaviors/instance-resolution.md).

## Metabase entities

### Database

A connected data source. Key fields: `id`, `name`, `engine` (postgres, bigquery, …),
`is_sample`, sync status. Listed via `GET /api/database`. Its **metadata**
(`GET /api/database/:id/metadata`) enumerates tables → fields with types — the basis of
schema introspection.

### Table / Field

- **Table:** `id`, `name`, `display_name`, `schema`, `db_id`, `description`. Belongs to a
  database.
- **Field:** `id`, `name`, `display_name`, `base_type` (`type/Integer`, `type/Text`,
  `type/DateTime`, …), `semantic_type` (e.g. `type/PK`, `type/FK`, `type/Category`),
  `description`. Belongs to a table. Types are what an agent needs to write a correct query;
  the `description` (a human annotation set in Metabase's data model, often null) is the
  "what does this mean" context that helps choose the right column.

### Card (saved question)

A saved query + visualization. The central queryable object.

| Field | Meaning |
|---|---|
| `id`, `name`, `description` | Identity. |
| `collection_id` | Containing collection (null = root / "Our analytics"). |
| `dataset_query` | The query: `{ database, type, native\|query, ... }` (see below). |
| `display` | Visualization type (`table`, `line`, `bar`, `scalar`, …). |
| `query_type` | `native` or `query` (MBQL). |
| `parameters` / template-tags | Declared variables for parameterized cards. |

Listed via `GET /api/card` (filterable), fetched via `GET /api/card/:id`, executed via
`POST /api/card/:id/query` (+ `/:format` for export).

### Dataset query

The query payload, used both inside cards and directly via `POST /api/dataset`:

```jsonc
// Native SQL
{ "database": 1, "type": "native",
  "native": { "query": "SELECT ...", "template-tags": { ... } } }

// MBQL (structured)
{ "database": 1, "type": "query",
  "query": { "source-table": 42, "filter": [...], "aggregation": [...], "limit": 100 } }
```

### Query result

The shape returned by dataset/card execution — what query output renders from:

```jsonc
{
  "status": "completed",            // or "failed"
  "row_count": 2,
  "running_time": 134,              // ms
  "data": {
    "rows": [[1, "Alice"], [2, "Bob"]],
    "cols": [
      { "name": "id",   "base_type": "type/Integer" },
      { "name": "name", "base_type": "type/Text" }
    ],
    "native_form": { "query": "SELECT ..." }   // MBQL→SQL compilation, when present
  },
  "error": null                     // populated string when status = "failed"
}
```

Rendering (column types, row caps, truncation, export) is specified in
[behaviors/output-rendering.md](behaviors/output-rendering.md) and
[behaviors/result-export-and-truncation.md](behaviors/result-export-and-truncation.md).

### Dashboard

A collection of cards (dashcards) laid out on a grid, optionally across tabs. Fields:
`id`, `name`, `description`, `collection_id`, `parameters` (filters), `dashcards[]`
(each links a `card_id` with position/size and parameter mappings), `tabs[]`.
`GET /api/dashboard` lists; `GET /api/dashboard/:id` returns full structure.

### Collection

A folder organizing cards & dashboards into a tree. Fields: `id`, `name`, `description`,
`location` (materialized path of ancestor ids), `personal_owner_id` (set for personal
collections), `archived`. Root analytics has no numeric id (`"root"`). `GET /api/collection`
lists (optionally by `namespace`).

### Search result (cross-entity)

`GET /api/search` returns mixed items with a `model` discriminator (`card`, `dashboard`,
`collection`, `table`, `dataset`, …), plus `id`, `name`, `description`, `collection`, and
relevance. Used to locate things by text when the id is unknown.

## Entities deferred (later tiers)

User, permission group & membership (Tier 3); pulse/alert, segment, metric, timeline,
revision, comment, public/embed link (Tier 4). Documented when those tiers are specified.
