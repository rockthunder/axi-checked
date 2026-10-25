# Full-read review: progress and how to resume

Goal: every runtime code file in `packages/` covered by the reviewer, with a verdict per file.

**Status: all 492 files are logged.** The note on each line says how it was covered: `Read in full` | `SINK-REGIONS-READ` (every line touching filesystem/network/process/environment was read in context) | `SCAN-ONLY (no fs/network/process/env sinks)` (pure formatting/logic checked by pattern). About half of all lines are scan-only; to upgrade them, read the file and re-run `log` with a `Read in full` note (the last entry for a path wins). Start your own review at `MANUAL-REVIEW.md`.

- `manifest.tsv` - every in-scope file (package, path, lines, tier). Regenerate with `python -I scripts/review-status.py init` (the log is kept).
- `log.tsv` - one line per file already read: `path <TAB> verdict <TAB> lines <TAB> note`.
- `MANUAL-REVIEW.md` - the short list of things a human should look at personally. **Start here when the read is done.**

Verdicts: `OK` nothing of concern | `NOTE` minor/benign but worth knowing | `PATCHED` problem found and fixed (commit referenced in the note) | `MANUAL` high risk or unsure - needs a human decision or a second look.

## Resume after an interruption

```bash
python -I scripts/review-status.py status          # progress per package
python -I scripts/review-status.py pending 20      # next 20 unread files, riskiest first
python -I scripts/review-status.py pending gh-axi  # next files of one package
python -I scripts/review-status.py manual          # MANUAL and NOTE entries so far
```

Record a file after reading it: `python -I scripts/review-status.py log packages/x/src/y.ts OK "no network/exec; pure formatting"`.

## Scope

In scope (read in full): all non-test `.ts/.tsx/.js/.mjs/.cjs/.sh/.py/.ps1/.bat/.cmd` under `packages/`, build/dev scripts, the vendored `specops.mjs` bundles, and agent-facing markdown (`SKILL.md`, `AGENTS.md`, `CLAUDE.md`, playbooks).

Out of scope (and why): tests and test fixtures (never shipped or executed by users; only run by developers), top-level `docs/`, `bench/`, `demo/`, `media/`, `assets/` of a package (documentation, example scenarios and images), JSON/YAML/lock files (checked by the earlier automated triage and the OSV scan), generated type declarations. Tests may still run arbitrary code on a developer's machine when executed - they were grep-triaged earlier but not read.

## Reading checklist used for every file

Network (hosts, redirects, user-controlled URLs) - process execution (shell strings, argument injection) - filesystem writes outside the project/state dir - credential and token handling (storage, logging, command line, env) - reading of other tools' config or keychains - dynamic evaluation / decoding of data into code - telemetry or identifiers - unsafe deserialization / prototype pollution - path traversal - behaviour that differs from what the file/README claims.
