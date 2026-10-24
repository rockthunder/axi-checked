---
status: done
depends: [config-and-auth, discovery, cards-and-dashboards]
specs:
  - specs/commands/home.md
  - specs/commands/setup.md
issues: []
---

# Plan: home view, SessionStart hooks & skill

## Scope

The content-first home view, the `setup hooks` installer, and the agent skill — the things
that make metabase-axi present itself in a session. In: `src/commands/{home,setup}.ts`,
`skills/metabase-axi/SKILL.md`, the home-on-no-args wiring. Depends on the read endpoints
existing so home can show real recent content. Out: nothing further in the MVP — this closes it.

## Implements

- `specs/commands/home.md` — orientation pull (user, db count, recent cards/dashboards),
  onboarding fallback when unconfigured, resilience on unreachable/auth failure, `help[]`
  including `--help` / `<command> --help`.
- `specs/commands/setup.md` — `setup hooks` over `installSessionStartHooks`.

## Approach

1. `home.ts`: cache-first profile summary; small recent-cards/dashboards pulls; degrade to a
   status line + `doctor` hint on failure; onboarding view when no profile/creds; never throw.
2. `setup.ts`: `installSessionStartHooks({marker:"metabase-axi", binaryNames:["metabase-axi"]})`;
   idempotent; works with no profile configured.
3. `SKILL.md` built from CLI metadata (follow family `build:skill` pattern if adopted).

## Validation

- [x] `metabase-axi` (no args) shows instance + status + recent content + `help[]`, and the
      `help[]` includes `--help` and `<command> --help`. (Verified live: instance, status
      "user …", recent_cards[5], 5 help lines incl. both.)
- [x] With no profile configured, home shows the onboarding view and exits 0 (never throws).
      (Verified live with an empty temp config dir.)
- [x] On an unreachable instance, home degrades gracefully with a `doctor` suggestion.
      (Status fetch is wrapped; failure returns "configured but not reachable" + doctor hint.)
- [x] `setup hooks` installs hooks idempotently and works with no profile present.
      (Unit-tested: writes `<home>/.claude/settings.json` containing the metabase-axi marker.)
- [~] A new session injects the home payload via the hook. (Mechanism verified — the hook
      file is written and points at the binary — but end-to-end session injection was not
      exercised to avoid mutating the real `~/.claude`. See follow-up.)

## Risks / unknowns

- **Hook payload latency** — home must stay cache-backed and fast; cap the recent pulls.

## Notes

- Shipped directly to `main` (no PR; pre-v1).
- Home status prefers the cached profile summary (instant); falls back to a 5s-timeout
  `user/current` fetch. Recent cards are a best-effort 5s call, sorted by `updated_at`,
  capped at 5 — skipped silently on failure so the hook never stalls or throws.
- `setupCommand` takes an optional `{homeDir, shouldInstall}` seam for tests; production
  passes neither, so the SDK's default "real installed binary" gate applies (it won't
  install hooks when run from an arbitrary dev path).
- `SKILL.md` hand-written (no `build:skill` script adopted); included via package `files`.

## Follow-ups

- **Deferred:** confirm end-to-end SessionStart injection after the tool is installed
  (npm global / bun link) — `setup hooks` is gated to the real binary, so verify against an
  installed `metabase-axi` rather than the `node dist/...` dev path.
