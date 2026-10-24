---
status: done
depends: [output-foundation]
specs:
  - specs/behaviors/result-export-and-truncation.md
issues: []
---

# Plan: auto-export to OS temp dir (not ~/.config)

## Scope

Move auto-generated export files (`--<fmt>-out` with no path) from
`~/.config/metabase-axi/exports/` to the OS temp dir, and write them owner-only. Explicit
`--<fmt>-out=<path>` is unchanged. In: `output.ts` (`resolveExportPath`, `performExport`),
`config.ts` (drop unused `exportsDir`), the spec, and the export test. Out: any pruning
logic — the OS prunes its temp dir.

## Implements

- `specs/behaviors/result-export-and-truncation.md` — auto-path = `<os-temp-dir>/metabase-axi/`,
  `0600` on auto-generated files, explicit paths untouched.

## Approach

- `resolveExportPath`: auto path → `join(os.tmpdir(), "metabase-axi", "<ts>-<kind>.<ext>")`.
- `performExport`: `writeFileSync(..., { mode: 0o600 })` only when the path was
  auto-generated (`!req.path`).
- Remove `exportsDir()` from `config.ts` (no remaining callers).

## Validation

- [x] Auto path lands in `os.tmpdir()/metabase-axi`, never under the config dir
      (unit-tested + verified live: `/var/folders/.../T/metabase-axi/...json`).
- [x] Auto-generated files are `0600` (unit-tested; verified live `-rw-------`).
- [x] Explicit `--csv-out=/path` still writes exactly there with default perms.
- [x] No stale `exportsDir` references; build + full test suite green.

## Risks / unknowns

- **`0600` vs umask** — `writeFileSync` mode is masked by umask; `0600` survives the common
  `022`. Verified on macOS; CI runner is `022`.

## Notes

- Why: an auto-generated export is ephemeral scratch. `~/.config` is durable state that
  nothing prunes, so auto-exports there grow unbounded. The OS temp dir is pruned by the OS
  and matches the original intent in kunchenguid/axi#32. Caught in review by the owner.

## Follow-ups

- None.
