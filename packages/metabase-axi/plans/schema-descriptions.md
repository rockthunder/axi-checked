---
status: done
depends: [discovery]
specs:
  - specs/commands/database.md
  - specs/data-model.md
issues: []
---

# Plan: surface Metabase descriptions in db schema

## Scope

Surface the human-authored `description` annotations Metabase stores on tables and fields
in `db schema` output. In: `Field`/`Table` types, the schema rendering, and `--search`
matching against description text. Out: editing descriptions (a Tier-2 write).

## Implements

- `specs/data-model.md` — `description` on Table and Field.
- `specs/commands/database.md` — descriptions surfaced when present; `--search` matches
  description text.

## Approach

- Add `description?: string | null` to `Field` and `Table` (already returned by
  `/api/database/:id/metadata`).
- A `description` column is added to the field listing / table overview / search matches
  **only when at least one item in that set is annotated** — otherwise omitted, to preserve
  the token budget. Descriptions are truncated at 160 chars.
- `--search` also matches against `description`, so a column can be found by its documented
  meaning, not just its name.

## Validation

- [x] No-annotation set: `description` column is omitted (verified live — the test instance
      has zero annotations across all databases, output unchanged).
- [x] Annotated set: `description` appears for every row (empty string where unset, keeping
      the table rectangular). Unit-tested in `test/schema.test.ts` + synthetic fixture.
- [x] Long descriptions truncate with the standard marker.
- [x] `--search` matches description text (predicate covers name/display/description).

## Risks / unknowns

- **Couldn't live-verify a populated description** — the test instance has none annotated;
  covered by unit tests with synthetic metadata instead.

## Notes

- Shipped directly to `main` (no PR; pre-v1). Read-only enhancement, within Tier 1.
- `fieldRows()` is exported from `src/commands/database.ts` for unit testing.

## Follow-ups

- None.
