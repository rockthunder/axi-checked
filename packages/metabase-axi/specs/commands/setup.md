# Command: setup

Install the SessionStart hooks that inject the [home](home.md) view into agent sessions.
Thin wrapper over the SDK's `installSessionStartHooks`.

## Invocation

```
metabase-axi setup hooks
```

## Data Requirements

None from Metabase. Calls `installSessionStartHooks({ marker, binaryNames })` from
`axi-sdk-js`, which writes/repairs native hooks for Claude Code, Codex, and OpenCode and
resolves a portable command (binary name if on PATH, else absolute path).

## Display Rules

- `setup: hooks installed` (or `already up to date`) + the integrations touched +
  `help[]` to start a new session and run `auth add`/`doctor` if not configured.
- Unknown subcommand → validation error listing `setup hooks`.

## Actions

- Mutates agent-harness config files (idempotent: re-running is a silent no-op when current).
- Requires **no** instance/credentials — must work before any profile exists; not subject
  to instance resolution.

## Navigation

- After install → `auth add` (if needed) → start a new session to see home injected.

## Principles

**Inherited:**

- [Read-first, mutation-explicit](../principles.md#read-first-mutation-explicit) — setup is
  an explicit, idempotent configuration action, isolated from Metabase reads/writes.
