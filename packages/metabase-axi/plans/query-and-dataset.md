---
status: done
depends: [config-and-auth, output-foundation]
specs:
  - specs/commands/query.md
  - specs/api/conventions.md
  - specs/data-model.md
issues: []
---

# Plan: query command + dataset client

## Scope

Ad-hoc query execution — the centerpiece of the analyst MVP. In: `src/metabase/dataset.ts`
(`POST /api/dataset` + `/:format`, parameter values) and `src/commands/query.ts` (native
SQL, stdin `-`, `--mbql`, `--db`, `--params`, preview + export). Out: saved-card execution
(reuses this rendering in `cards-and-dashboards`).

## Implements

- `specs/commands/query.md` — full invocation surface, result rendering, QUERY_ERROR
  handling, expensive-op instance guard.
- `specs/api/conventions.md` — dataset + export endpoints.
- `specs/data-model.md` — dataset query + query result shapes.

## Approach

1. `src/metabase/dataset.ts`: `runDataset({database,native|mbql,params})` →
   `POST /api/dataset`; `exportDataset(query, format)` → `POST /api/dataset/:format`
   returning bytes; `parameterValues()`.
2. `src/commands/query.ts`: parse SQL arg / stdin `-` / `--mbql`; resolve `--db` (id or
   name, single-db fallback); build the dataset query; run; render preview via
   `output-foundation`; on a `*-out` flag call the export path; surface `native_form`
   for MBQL; map `status:failed` → `QUERY_ERROR` with verbatim server text.
3. Apply the expensive-op instance guard from `instance-resolution`.

## Validation

- [x] `query "SELECT 1 AS n"` against a configured db shows a 1-row preview with `cols`
      types and echoed `instance:`/`database:`/`rows:`/`time:`. (Verified live.)
- [x] `echo "SELECT …" | query -` reads SQL from stdin. (Verified live.)
- [x] `query --mbql '{…}'` runs MBQL and surfaces compiled SQL when present. (Verified live
      against a real table id; `sql:` shows the compiled query.)
- [x] A result over the cap truncates with `rows: N of M`; `--limit` raises the preview.
      (Verified live with a 100-row generate_series.)
- [x] `query "…" --csv-out /tmp/r.csv` writes CSV, preview unchanged, `jq`/`wrote:` lines
      shown. (Verified live; json + auto-path also verified.)
- [x] A bad SQL string yields a `QUERY_ERROR` carrying the server's message verbatim, exit 1.
- [x] With 2+ profiles and no `--instance`/env, `query` stops (expensive-op guard).
      (`query` resolves with `risky:true`; ambiguity-stop unit-tested in `resolve.test.ts`.)

## Risks / unknowns

- **`--db` resolution UX** — name→id lookup needs a db list; cache or fetch once.
- **Large/expensive queries** — rely on Metabase's server-side row cap; document it; do not
  auto-paginate.

## Notes

- Shipped directly to `main` (no PR; pre-v1).
- `renderQueryResult` (`src/result.ts`) is shared with `card run` (cards-and-dashboards):
  capped preview + optional file export, JSON serialized from the in-memory result,
  csv/xlsx fetched via an injected `exportBytes` callback (dataset vs card endpoint).
- `showCompiledSql` echoes `native_form` only for MBQL/cards — suppressed for native SQL
  the user already typed, to save tokens.
- `--db` accepts an id or a case-insensitive name; with one database it's inferred.
- Live note: the test instance has external databases with broken downstream connections
  (the env's known unreachable DBs) — those return a real `QUERY_ERROR`. The live dataset
  test tries databases until one answers, so it's instance-agnostic.

## Follow-ups

- None.
