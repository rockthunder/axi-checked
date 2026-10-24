# Command: collection

Browse the collection tree (folders organizing cards & dashboards). Tier 1 is list-only;
create is Tier 2.

## Invocation

```
metabase-axi collection list [flags]
```

Flags: `--parent <id>` (children of one collection), `--archived`, `--namespace <ns>`,
`--limit <n>`, `--instance <name>`.

## Data Requirements

`GET /api/collection` (`?namespace=` optional). Tree position derived from `location`
(materialized path of ancestor ids); root analytics is `"root"`.

## Display Rules

- `collections[N]{id,name,parent,personal}` — `parent` from `location`; `personal` flags
  personal collections. `[N of M]` cap + `help[]`.
- With `--parent <id>`, scope to direct children and echo the parent in a header line.

## Actions

Read-only. Default profile acceptable.

## Navigation

- `collection list --parent <id>` to descend; `card list --collection <id>` /
  `dashboard list --collection <id>` to see contents.

## Principles

**Inherited:**

- [Tokens are the budget](../principles.md#tokens-are-the-budget) — flat, capped listing
  with descent via `--parent` rather than dumping the whole tree.
