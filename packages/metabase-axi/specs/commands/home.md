# Command: home (no args)

The content-first view shown when `metabase-axi` is run with no command — and the payload
injected by the SessionStart hook (see [setup](setup.md)).

## Invocation

```
metabase-axi
```

## Data Requirements

For the resolved default instance (read-only, default profile acceptable): a lightweight
orientation pull — current user (`GET /api/user/current`, cached), database count
(`GET /api/database`), and a short list of recently-edited cards/dashboards
(`GET /api/card`, `GET /api/dashboard`, small limit). Uses cached profile summary when
fresh to keep the hook fast.

## Display Rules

Content-first, not usage text (the SDK prepends `bin` + `description`):

- `instance:` — default profile name + host (and a note if multiple profiles exist).
- `status:` — `user`, `databases: N`, server version (from cache).
- A small `cards[≤5]{id,name,edited}` and/or `dashboards[≤5]{id,name,edited}` recent list.
- `help[]` — the high-value next steps: `db list`, `search <q>`, `query <sql>`, `card list`,
  and `doctor` / `auth` if not yet configured. Per family convention, the `help[]` block
  also always includes `metabase-axi --help` (full command list) and
  `metabase-axi <command> --help` (per-command usage) as discoverability examples — present
  in both the configured and onboarding views.

When **no** profile/credentials are configured, home becomes an onboarding view:
`message:` that setup is needed + `help[]` pointing at `auth add` and `setup hooks`. It
must never error out in this state (the hook runs every session).

## Actions

Read-only. Resilient: on an unreachable instance or auth failure, degrade to a status line
noting the problem + a `doctor` suggestion rather than throwing.

## Navigation

Entry point to everything; `help[]` routes to `db list`, `search`, `query`, `card list`.

## Principles

**Inherited:**

- [Tokens are the budget](../principles.md#tokens-are-the-budget) — the hook payload is
  small and cache-backed.
- [Never guess which instance](../principles.md#never-guess-which-instance) — read-only, so
  the default profile is used, but the resolved instance is always echoed.
