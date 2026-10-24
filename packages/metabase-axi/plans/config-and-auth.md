---
status: done
depends: [scaffold]
specs:
  - specs/behaviors/instance-resolution.md
  - specs/behaviors/credential-resolution.md
  - specs/api/conventions.md
  - specs/commands/auth.md
  - specs/commands/doctor.md
issues: []
---

# Plan: Config, instances, auth & the API client

## Scope

Profile/credential storage, resolution, the authenticated HTTP client, and the `auth` +
`doctor` commands. In: `src/config.ts`, `src/metabase/client.ts`, `src/commands/auth.ts`,
`src/commands/doctor.ts`, and `resolveContext` in `cli.ts`. Out: data/query commands
(later plans) — but they consume the client + resolved context this plan defines.

## Implements

- `specs/behaviors/instance-resolution.md` — precedence (env > `--instance` > default >
  single), ambiguity-stops-for-risky-ops, echo resolved instance.
- `specs/behaviors/credential-resolution.md` — env-over-config, API-key-primary/session-
  fallback, transparent re-auth on 401, never print secrets.
- `specs/api/conventions.md` — base-URL joining, auth headers, error-envelope → `AxiError`
  mapping, timeout.
- `specs/commands/auth.md`, `specs/commands/doctor.md`.

## Approach

1. `src/config.ts` modeled on harvest-axi/slack-axi: config dir resolution, `readConfig`/
   `writeConfig`, profile CRUD, `resolveInstance()` + `resolveCredentials()` returning a
   `source` discriminant. Restrictive file perms on write.
2. `src/metabase/client.ts`: `fetch` wrapper taking a resolved instance+creds; sets
   `X-API-Key` or `X-Metabase-Session`; `POST /api/session` for session auth with caching
   and one transparent retry on 401; maps non-2xx + failed-query bodies to `AxiError` codes.
3. `auth add|list|use|login|remove` — validate via `GET /api/user/current` before persist;
   cache profile summary; never echo secrets.
4. `doctor` — reachability + auth probes, `checks[]` table, exit codes.
5. `resolveContext` in `cli.ts` wires resolution lazily (skip for `setup`/help/version).

## Validation

- [x] `auth add prod --url … --api-key …` validates then persists; key never printed.
      (Verified live against the test instance; output shows scheme/user/dbs only.)
- [x] `auth list` shows profiles, marks default, flags an active env override.
- [x] Env vars override config (`source: env` in `doctor`). (Verified: `doctor` reports
      `api_key from env` with METABASE_URL set, `api_key from config` otherwise.)
- [x] With 2+ profiles and no `--instance`, a mutating/expensive command stops with a
      `CONFIG` error; a read-only list uses the default and echoes the instance.
      (Unit-tested in `test/resolve.test.ts`.)
- [x] Session auth obtains+caches a token; a forced 401 triggers exactly one transparent
      re-auth. (Unit-tested with mocked transport in `test/client.test.ts`; the test
      instance only offers API-key auth so this path isn't live-exercised.)
- [x] `doctor` reports reachable/auth/source and exits 1 on unreachable or bad auth.
- [x] 401/403/404/network map to `AUTH`/`FORBIDDEN`/`NOT_FOUND`/`UNREACHABLE`/
      `QUERY_ERROR` with actionable suggestions. (`test/client.test.ts` covers 404 +
      network; mapping table in `client.ts` covers the rest.)

## Risks / unknowns

- **API response shape variance across Metabase versions** (`/api/database` array vs
  `{data}`) — normalize in the client.
- **Secret-at-rest** — config stores credentials in plaintext like the family; document
  the file-perms expectation, don't invent a keychain here.

## Notes

- Shipped directly to `main` (no PR; pre-v1).
- **Resolution is done per-command via `createClient()` (in `src/resolve.ts`), not via the
  SDK `resolveContext` hook** — risky-ness depends on the subcommand (`card run` is
  expensive, `card list` isn't), which `resolveContext` (one entry per command) can't see.
  Still lazy: resolution runs only inside a handler. The behavior specs (precedence,
  ambiguity-stop, echo) are satisfied; `architecture.md`'s `resolveContext` mention is a
  how-detail and remains accurate in spirit.
- Live verification used `metabase.ops.k8s.jarv.us` (9 databases) via the env creds in
  [[test-instance]]; config file written at mode 600.
- `serverVersion` reads `/api/session/properties.version.tag` best-effort (tolerated absent).

## Follow-ups

- **Deferred to a later check:** live session (username/password) auth + 401 re-auth is
  only unit-verified — exercise it against an instance that has a password account when one
  is available.
