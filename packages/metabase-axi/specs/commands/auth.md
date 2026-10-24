# Command: auth

Manage named instance profiles and their credentials. The only commands that write to the
local config file.

## Invocation

```
metabase-axi auth add <name> --url <url> [--api-key <key> | --username <u> --password <p>]
metabase-axi auth list
metabase-axi auth use <name>            # set the default profile
metabase-axi auth login [<name>]        # obtain/refresh a session token (session auth)
metabase-axi auth remove <name>
```

## Data Requirements

- Reads/writes the config file (profiles + default) per
  [architecture.md](../architecture.md#configuration--instances).
- `add` and `login` validate by calling `GET /api/user/current` with the supplied
  credentials before persisting; on success cache the profile summary (user, version, db
  count).
- `login` performs the session flow (`POST /api/session`) and caches the token.

## Display Rules

- `add`/`use`/`login`/`remove`: a confirmation line + updated `profiles[N]{name,host,auth,default}`
  table. `auth` = `api_key`|`session`; **never print the key or password**.
- `list`: the same `profiles` table, marking the default and showing each profile's
  `source` if an env override is currently shadowing it.
- Validation failure → `AUTH`/`UNREACHABLE`/`CONFIG` error with the exact fix.

## Actions

- **Mutates local config** (not the Metabase instance). Idempotent: re-`add`ing a profile
  name updates it; `use` of the current default is a no-op success.
- Credentials are stored in the config file with restrictive file permissions; secrets are
  never echoed. Env vars (`METABASE_*`) override config at run time and are not written here.

## Navigation

- After `auth add` → `doctor` to verify, then `metabase-axi` (home) for orientation.

## Principles

**Inherited:**

- [Read-first, mutation-explicit](../principles.md#read-first-mutation-explicit) — auth is
  the deliberate, explicit configuration step; everything else stays read-first.
