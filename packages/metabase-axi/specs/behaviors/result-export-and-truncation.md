# Behavior: Result export & truncation

## Rule

Data-bearing commands return **two things from one invocation**: a small, agent-readable
**preview** on stdout, and — when requested — the **full raw payload written to a file**.
The preview is always capped; the file is never capped. The tool never dumps a large raw
result to stdout.

This is the metabase-axi realization of the cross-AXI "tools that return data" design
discussion ([kunchenguid/axi#32](https://github.com/kunchenguid/axi/issues/32),
evidence in #35): keep stdout optimized for agent reading, and offer a side-channel file
for follow-up `jq`/script processing — rather than a `--json`-to-stdout mode.

## Applies To

`query`, `card run`, and any list/view command whose payload can exceed the display cap
(`card list`, `search`, `db schema`, `dashboard view`).

## Details

### Preview (stdout, always)

- Query/data results render as a TOON table capped at **`PREVIEW_ROW_CAP` (default 20)**
  rows, with column names + base types echoed (see
  [output-rendering](output-rendering.md)).
- When rows exceed the cap, emit `rows: <shown> of <total>` and a truncation marker. Cell
  text is truncated per the char cap.
- The preview is identical whether or not a file is also written — writing a file does not
  change stdout.

### Full export (file, opt-in)

Format is chosen by an **explicit per-format flag** — no generic `--out`, no extension
inference, no `--format` selector. The flag names the format outright (no magic):

- **`--json-out[=<path>]`** — write the full query-result payload (rows + cols) as JSON.
- **`--csv-out[=<path>]`** — write the full result as CSV via Metabase's native export
  (`POST /api/dataset/:format`, `POST /api/card/:id/query/:format`).
- **`--xlsx-out[=<path>]`** — same, exported as XLSX.

Rules common to all three:

- The `=<path>` is optional. When omitted, the tool auto-generates
  `<os-temp-dir>/metabase-axi/<UTC-timestamp>-<kind>.<ext>` and reports the path. An
  auto-generated export is **ephemeral scratch**, so it goes in the OS temp dir (which the
  OS prunes) — never under `~/.config` (durable state that nothing prunes). An explicit
  `--<fmt>-out=<path>` writes exactly where asked, for when the file should persist.
- **Auto-generated export files are written `0600`** (owner-only) — query results can be
  sensitive and the OS temp dir is world-readable on some platforms. An explicit path is
  the caller's responsibility and is written with the default umask.
- At most one `*-out` flag per invocation; combining them is a validation error.
- When a file is written, stdout adds:
  - a `wrote:` line — `wrote: <path> (<row_count> rows, <col_count> cols)`;
  - a `columns:` line listing column names (so follow-up `jq` can be written without
    opening the file);
  - a `help[]` entry with a ready-to-run **`jq` example** pointed at the path, e.g.
    `Run \`jq '.data.rows[] | .[1]' <path>\`` (for JSON) or a `csvlook`/`head` hint for CSV.

### Caps & config

- `PREVIEW_ROW_CAP` and the cell char cap are constants (overridable by `--limit` for
  rows). Caps are always announced — a silent cap reads as "this is everything" when it
  isn't.
- Metabase also caps result rows server-side; when the server truncated, the preview's
  `rows:` total reflects the server-reported count and a `help[]` line notes the server cap.

## Principles

**Inherited:**

- [Preview to stdout, full data to a file](../principles.md#preview-to-stdout-full-data-to-a-file)
  — this behavior is its implementation.
- [Tokens are the budget](../principles.md#tokens-are-the-budget) — why the preview is
  capped at all.

**Local:**

- **The file is the source of truth for follow-up; stdout is for deciding.** When preview
  and file would diverge in what they could show, the preview optimizes for "is this the
  right data and what are the columns," and defers completeness to the file. Promote to
  `principles.md` if a second behavior needs it.
