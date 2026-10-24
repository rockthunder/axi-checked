# Behavior: Instance resolution

## Rule

Every command that talks to Metabase acts against exactly one resolved **instance
profile**, determined by this precedence (highest first):

1. **Env override** — if `METABASE_URL` (with credentials, see
   [credential-resolution](credential-resolution.md)) is set, it defines an ephemeral
   `env` instance that wins over everything. Source reported as `env`.
2. **`--instance <name>` flag** — selects a named profile from config.
3. **Default profile** — the config's `default` profile, for **read-only** commands only.
4. **Single profile** — if exactly one profile is configured, it is used.

If resolution yields nothing, raise a `CONFIG` `AxiError` suggesting `metabase-axi auth add`
or setting env vars.

## Applies To

All commands except `setup` and `--help`/`--version` (which need no instance). `doctor`
resolves the instance to probe it. `auth` manages profiles and resolves only as needed.

## Details

- **Ambiguity + mutation/expense:** for a **mutating** command, or a **potentially
  expensive** one (ad-hoc `query`, `card run`), when there are 2+ profiles and none was
  explicitly selected (no env, no `--instance`), the tool **stops** with a `CONFIG` error
  listing the profiles and instructing the use of `--instance`. It does **not** silently
  fall back to the default for these. (Read-only list/view commands may use the default.)
  This operationalizes [Never guess which instance](../principles.md#never-guess-which-instance).
- **Always echo the resolved instance.** Command output includes an `instance:` line with
  the profile name (or `env`) and base URL host, so a wrong target is visible at a glance.
- **Resolution is lazy.** Performed in `resolveContext` only for commands that need it,
  never for `--help`/`--version`/`setup`.

## Principles

**Inherited:**

- [Never guess which instance](../principles.md#never-guess-which-instance) — this behavior
  is its concrete implementation: explicit-or-stop for risky ops, echo-resolved for reads.
