# Behavior: Output rendering

## Rule

All command output is **TOON**, rendered through the SDK's output boundary and the
shared helpers in `src/output.ts` (`renderList`, `renderHelp`, `truncate`, `joinBlocks`).
Output is shaped for an agent reading it inside a finite context window: compact schemas,
relative timestamps, pre-computed aggregates, hard caps with explicit truncation markers,
and contextual `help[]` next-step suggestions.

## Applies To

Every command. Detail/data output additionally obeys
[result-export-and-truncation](result-export-and-truncation.md).

## Details

- **Block shapes.** Header lines for scalars (`instance:`, `database:`, `rows:`); TOON
  tables for collections (`cards[N]{id,name,collection,type}:`); a closing `help[N]:`
  block of next-step suggestions.
- **Always echo context.** Per
  [Surface the contract](../principles.md#surface-the-contract-dont-hide-metabase) and
  [Never guess which instance](../principles.md#never-guess-which-instance), data-bearing
  output leads with an `instance:` line (profile name or `env` + host). Query output also
  echoes `database:`, `rows:`, and `time:` (ms).
- **List schemas are minimal:** 3–5 columns per row. Long text fields are truncated with a
  `… (truncated, N chars total)` marker, never silently.
- **Counts are explicit:** `cards[30 of 412]{…}` when capped; pair with a `help[]` line for
  narrowing (`--limit`, a filter, or `search`).
- **Relative time** (`2h ago`, `3d ago`) over ISO timestamps in list/preview output.
- **Empty states are definitive:** `message: 0 cards match "<q>"` plus a `help[]` line, not
  an empty table.
- **Errors** are `AxiError` rendered by the SDK (`error:` / `code:` / `help[]`), mapped per
  [api/conventions.md#error-envelope](../api/conventions.md#error-envelope). Never leak a
  raw API error body; translate it, but preserve the server's query error text verbatim for
  `QUERY_ERROR`.
- **No secrets, paths collapsed to `~`.**

## Principles

**Inherited:**

- [Tokens are the budget](../principles.md#tokens-are-the-budget) — the reason for caps,
  TOON, and aggregates.
- [Surface the contract, don't hide Metabase](../principles.md#surface-the-contract-dont-hide-metabase)
  — the reason output echoes resolved instance/database/row-count and uses Metabase's
  real ids and vocabulary.
