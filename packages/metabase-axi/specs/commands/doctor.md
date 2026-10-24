# Command: doctor

Health check: is the resolved instance reachable, are credentials valid, and where did
they come from. Mandatory family command.

## Invocation

```
metabase-axi doctor [--instance <name>]
```

## Data Requirements

For the resolved instance + credentials
([instance-resolution](../behaviors/instance-resolution.md),
[credential-resolution](../behaviors/credential-resolution.md)):

- Reachability probe of the base URL.
- Auth probe: `GET /api/user/current`.
- Report the auth scheme (`api_key`/`session`) and credential `source` (`env`/`config`).

## Display Rules

- `instance:` (name/`env` + host) and a `checks[N]{name,status,detail}` table:
  `reachable`, `auth`, `source`, plus `databases` count when reachable.
- `status` ∈ `ok|warn|fail`. Exit `0` on `ok`/`warn`, `1` on a hard `fail` (unreachable or
  invalid auth).
- `help[]` gives the exact remediation for any non-ok check (`auth login`, set env, check
  URL/VPN).

## Actions

Read-only. Resolves but never mutates.

## Navigation

- On failure → `auth add`/`auth login` or fix env; on success → `metabase-axi` (home).

## Principles

**Inherited:**

- [Surface the contract, don't hide Metabase](../principles.md#surface-the-contract-dont-hide-metabase)
  — doctor exists to make the resolved instance, scheme, and credential source visible.
