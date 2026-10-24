---
status: done
depends: [scaffold]
specs:
  - specs/behaviors/output-rendering.md
  - specs/behaviors/result-export-and-truncation.md
issues: [32]
---

# Plan: Output foundation (TOON rendering + export)

## Scope

The shared output layer every data command uses. In: `src/output.ts` (TOON helpers —
`renderList`, `renderHelp`, `truncate`, `joinBlocks`, header lines), the preview/cap logic,
and the per-format `--json-out`/`--csv-out`/`--xlsx-out` full-export-to-file behavior with the `jq` `help[]`
hint and auto-path generation. Out: the actual queries that produce data (later plans) —
this plan provides the rendering/export primitives + unit tests against fixtures.

## Implements

- `specs/behaviors/output-rendering.md` — TOON block shapes, minimal schemas, relative time,
  explicit counts, definitive empty states, secret/path handling.
- `specs/behaviors/result-export-and-truncation.md` — `PREVIEW_ROW_CAP`, truncation markers,
  `--json-out`/`--csv-out`/`--xlsx-out` file writing, auto-generated path,
  `wrote:`/`columns:`/`jq` help lines. Realizes the AXI #32 stance.

## Approach

1. `src/output.ts`: thin wrappers over `@toon-format/toon` + SDK output; helpers for header
   lines (`instance:`, `database:`, `rows:`, `time:`), capped tables, truncation markers.
2. Export module: a `writeExport(result, {path, format})` where `format` comes from the
   explicit flag (no extension inference); routes csv/xlsx to the Metabase native-export
   bytes (passed in by callers) and json to a serialized payload, generates
   `<config>/exports/<ts>-<kind>.<ext>` when no path given, and returns the
   `wrote:`/`columns:`/`jq`-hint metadata for the caller to render.
3. Flag parsing helpers for `--json-out[=path]`/`--csv-out[=path]`/`--xlsx-out[=path]`/
   `--limit` (at most one `*-out` per invocation).

## Validation

- [x] Rendering a >cap result shows exactly `PREVIEW_ROW_CAP` rows + `rows: N of M` marker.
      (`rowsToObjects` caps; `countLabel` produces the marker — both unit-tested.)
- [x] Cell text over the char cap shows `… (truncated, N chars total)`.
- [x] `--json-out` with no path writes to an auto-generated file and reports it.
      (Auto-path code path unit-tested via `--csv-out`; identical for json.)
- [x] `--csv-out foo.csv` / `--json-out foo.json` write the correct format;
      `wrote:`/`columns:`/`jq` help lines appear. (Stdout-preview-unchanged is enforced by
      the consuming command and verified live in `query-and-dataset`.)
- [x] Combining two `*-out` flags in one invocation is a validation error.
- [x] No secret values appear in rendered output; the home `bin:` path collapses to `~`
      (via the SDK header). Export `wrote:` paths are user-supplied and shown verbatim.
- [x] vitest fixtures cover preview cap, truncation, and json/csv export. (xlsx shares the
      Buffer-write path with csv; empty-state messages live with each command.)

## Risks / unknowns

- **Auto-path location** — exports land under `<config-dir>/exports/`; ensure the dir is
  created on demand and the resolved path is reported clearly.
- **xlsx bytes** — binary export passes through untouched; ensure no UTF-8 mangling.

## Notes

- Shipped directly to `main` (no PR; pre-v1).
- Handlers return structured objects; the SDK TOON-encodes them. `rowsToObjects` converts
  row arrays to objects keyed by column name so TOON renders a `data[N]{cols}:` table;
  types are surfaced compactly via a `columns:` line (`id:Integer, name:Text`) rather than
  bloating the table header.
- `performExport(req, kind, data, meta)` owns path resolution (explicit or auto under
  `exportsDir()`), `~`/relative expansion, dir creation, and the `wrote:`/`columns:`/jq
  hint. Commands supply the bytes (csv/xlsx from Metabase export) or JSON string.

## Follow-ups

- None.
