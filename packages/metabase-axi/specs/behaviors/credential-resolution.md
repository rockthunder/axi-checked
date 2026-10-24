# Behavior: Credential resolution

## Rule

For a resolved [instance](instance-resolution.md), credentials are resolved with **env
precedence over config**, and **API key preferred over session login**:

1. **Env (CI/cron):** if `METABASE_API_KEY` is set → API-key auth. Else if
   `METABASE_USERNAME` + `METABASE_PASSWORD` are set → session auth. Env credentials pair
   with `METABASE_URL` (the `env` instance). Source = `env`.
2. **Profile config:** the selected profile's `auth.api_key` → API-key auth; else its
   `auth.username`/`auth.password` → session auth. Source = `config`.

If neither yields usable credentials, raise a `CONFIG` `AxiError` pointing at
`metabase-axi auth add` / the relevant env vars.

## Applies To

The API client for every Metabase-touching command. Surfaced by `doctor` (which reports
the auth scheme and `source`).

## Details

- **API-key auth** sends `X-API-Key`; it never expires and needs no session call.
- **Session auth** lazily calls `POST /api/session` to obtain a token, caches it in the
  profile (`session.token` + obtained-at), and sends `X-Metabase-Session`. On `401`, the
  cached token is discarded and re-obtained once; a second failure is an `AUTH` error.
- **Precedence matches the family** (harvest-axi, slack-axi): env always wins so CI and
  one-off overrides work without touching the config file.
- **Never print secrets.** Output may name the auth scheme (`api_key` / `session`) and the
  source (`env` / `config`), never the key or password. Collapse home paths to `~`.

## Principles

**Inherited:**

- [Read-first, mutation-explicit](../principles.md#read-first-mutation-explicit) — auth is
  resolved the same for reads and writes, but mutations additionally require an explicit
  instance (see [instance-resolution](instance-resolution.md)).
