---
status: done
depends: [config-and-auth, output-foundation, query-and-dataset]
specs:
  - specs/commands/card.md
  - specs/commands/dashboard.md
  - specs/api/conventions.md
issues: []
---

# Plan: cards & dashboards (read/execute)

## Scope

Saved-question and dashboard browsing + card execution. In: `src/metabase/{card,dashboard}.ts`
and `src/commands/{card,dashboard}.ts` — `card list|view|run`, `dashboard list|view`. Out:
creating/editing cards or dashboards (Tier 2). `card run` reuses query-result rendering from
`query-and-dataset`.

## Implements

- `specs/commands/card.md` — `list` (filters), `view` (query + params), `run` (execute +
  preview/export, expensive-op guard).
- `specs/commands/dashboard.md` — `list`, `view` (dashcards + parameters + tabs).

## Approach

1. `card.ts`: `listCards(filter)`, `getCard(id)`, `runCard(id, params, format?)` →
   `POST /api/card/:id/query(/:format)`. `card run` renders via the shared query-result
   renderer; `card view` shows native SQL inline or an MBQL summary + declared params.
2. `dashboard.ts`: `listDashboards()`, `getDashboard(id)`; `view` renders
   `cards[]{card_id,name,viz,tab}` + `parameters[]{name,type}`, grouping by tab when present;
   `--json-out` dumps full structure.
3. Wire `help[]` cross-links: card view→run, dashboard view→`card run <card_id>`.

## Validation

- [x] `card list --mine` / `--archived` / `--db` / `--collection` filter with capped output.
      (Verified live; "5 of 188". --db/--collection filter client-side on the listed cards.)
- [x] `card view <id>` shows the query text + parameters; long SQL truncates with marker.
      (Handles native SQL, classic MBQL `query`, and the newer pMBQL `stages` shape.)
- [x] `card run <id>` renders identically to `query` results and honors `--json-out`/
      `--csv-out`/`--params`/`--limit` + the expensive-op instance guard. (Verified live:
      preview + CSV export of an 83-row card; reuses `renderQueryResult`.)
- [x] `dashboard list` shows id/name/collection/edited. (Card count moved to `view` — the
      list endpoint omits dashcards; spec updated accordingly.)
- [x] `dashboard view <id>` lists dashcards with viz + parameters; tabs grouped when present.
      (Verified live on a 6-dashcard dashboard; `--json-out` dumps full structure.)
- [x] `help[]` cross-links resolve to runnable commands.

## Risks / unknowns

- **Parameter mapping** — parameterized cards need correct `{parameters}` shape; cover with
  a parameterized fixture.

## Notes

- Shipped directly to `main` (no PR; pre-v1).
- **Spec correction:** `dashboard list` drops the `cards` count — the `/api/dashboard` list
  response has no dashcards and counting per-dashboard would be N+1; the count lives in
  `view`. `dashboard.md` display rule updated.
- **pMBQL:** newer Metabase cards use a `dataset_query` with `stages` + `lib/type` (no
  `type`/`query`/`native`); `card view` discriminates on the card's `query_type` and renders
  native SQL, classic `query`, or `stages`.
- `card run` reuses `renderQueryResult` with an `exportBytes` that calls the card export
  endpoint; csv export returns Metabase display-name headers.
- `--db`/`--collection` on `card list` filter client-side (the `f=database` server filter
  needs a `model_id`); robust across versions.

## Follow-ups

- **Deferred:** exercise a parameterized `card run --params` against a parameterized card
  (the test instance card used had no required parameters).
