# Security review

Review date: 2026-10-24. Reviewer: Claude (AI-assisted review, supervised by the repository owner). Upstream commits reviewed are listed in [`SOURCES.md`](SOURCES.md).

**This is a risk-reduction review, not a certification.** Read "What was not done" before relying on it.

## Scope and method

Reviewed: 21 CLIs (`canva-axi` and `gws-axi` were reviewed and then removed from the repo at the owner's request; findings about them are kept for the record) and the shared SDK (`axi-sdk-js`), taken from the projects linked in the [AXI catalog](https://github.com/kunchenguid/axi#readme).

What was done:

1. **Pattern triage of every tracked file** in every repo: external hosts, `eval`/`new Function`, base64/hex decoding, child-process execution, network calls, credential and key-file access, environment dumping, install-time lifecycle scripts, non-registry dependencies, binaries/archives, minified or very long lines, committed agent/IDE configuration.
2. **Targeted reading** of everything those patterns flagged, and of the SDK (`axi-sdk-js`) that every tool shares: updater, hook installer, CLI dispatcher.
3. **Audit of vendored generated bundles** (`specops.mjs`, three copies): no network access; runs `git rev-parse`; writes a Claude settings file.
4. **Dependency audit**: lockfiles resolved fresh and queried against the public OSV.dev vulnerability database, split into *runtime-reachable* packages (what ships to users) and *dev-only* packages (test/build tooling). Whole resolved tree (727 package names) also swept by name for telemetry/analytics/update-notifier SDKs: none.
5. **Third-party code inspected before adopting it**: the `chrome-devtools-mcp@1.11.0` tarball was downloaded and read (it contains Google usage-statistics, update-check and CrUX code - see below).
6. **Test runs on Linux** (container) for every package after patching.

Findings in the upstream code: **no backdoor, obfuscated payload, credential-exfiltration code, hidden endpoint, or malicious install script was found.** What was found is the convenience-driven behaviour listed below, which is unacceptable in a controlled environment.

## What was changed (each is its own commit)

| # | Change | Where | Why |
|---|---|---|---|
| 1 | Removed the built-in **self-update** (looked up the latest version on the public npm registry and ran `npm install -g <pkg>@latest`). `update` now only prints that it is disabled. | `axi-sdk-js` (inherited by every tool) | Would bypass this review on every update. |
| 2 | Removed **telemetry**: anonymous usage events (command name, platform, arch, version) were sent by default to `a.kunchenguid.com`; no build-time telemetry settings remain. | `lavish-axi` | Default-on data egress. |
| 3 | Disabled **hosted share** (publishing pages to the third-party host `ht-ml.app`) at the CLI, the server route and the HTTP client. `export` (local file) remains. | `lavish-axi` | Data egress to an unvetted third party; the host has no delete endpoint. |
| 4 | Stopped the web server from **auto-binding the Tailscale address** (it also listened on the tailnet IP "for phone access"). Explicit `LAVISH_AXI_HOST` / `--also-listen` still work. | `lavish-axi` | Exposed an unauthenticated local editor to the whole tailnet by default. |
| 5 | Runs a **pinned, bundled `chrome-devtools-mcp@1.11.0`** from `node_modules` instead of `npx -y chrome-devtools-mcp@latest`; dropped PATH/global-npm/npx launch sources; always passes `--no-usage-statistics` and `--no-performance-crux`; forces `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1` and `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`. | `chrome-devtools-axi` | Unpinned runtime download; Google telemetry; CrUX lookups send visited URLs to Google. |
| 6 | **Skills no longer say `npx -y <tool>`** (they say to use the vetted install), and no longer advertise self-update. | skill generators, `SKILL.md` files and tests in most packages | Agents follow these instructions automatically; they would have fetched the public, unreviewed packages. |
| 7 | Credentials passed to `curl` through stdin config, not the command line. | `elasticsearch-axi` | API keys/passwords were visible to other local users in the process list. |
| 8 | Removed committed **auto-executing / unpinned dev config**: a `.claude/settings.json` SessionStart hook that ran a vendored script whenever the repo was opened in Claude Code; `.airlock/` workflows using third-party actions at `@main`; `prepare` build-on-install scripts. | `chrome-devtools-axi`, `gh-axi`, `lavish-axi`, `msgraph-axi` (and formerly `gws-axi`) | Code execution on checkout/install. |
| 9 | Dropped the Turborepo-driven root of `atlassian-axi` from the workspace (Turborepo prints that it collects anonymous telemetry). Sub-packages get their dev tools directly. | `jira-axi`, `confluence-axi` | Telemetry in the build toolchain. |
| 10 | **Dependencies**: all upstream lockfiles (several pinned stale, vulnerable versions) replaced by one fresh lockfile; overrides force `@toon-format/toon` >= 2.3.1 (prototype pollution), `body-parser` 2.4.0, `fast-uri` 3.1.9. **Runtime-reachable known advisories: 0.** | whole workspace | See "Dependency status". |
| 11 | Read-only guard replaced by a **statement tokenizer + server-enforced read-only transaction** (`default_transaction_read_only=on`); URL passwords moved off the command line into `PGPASSWORD`. | `pg-axi` | The old regex guard could be bypassed with comments/quotes/multi-statement input. |
| 12 | Read-only guard replaced by an **allowlist** of read commands (`EVAL`, `SHUTDOWN`, `PUBLISH`, `MODULE LOAD`... were unguarded); `create --kind user` no longer makes a passwordless superuser (password required, read-only ACL by default, sent on stdin); URL password moved to `REDISCLI_AUTH`. | `redis-axi` | Unsafe defaults and a guard that missed dangerous commands. |
| 13 | `config view` no longer uses `--raw`; `inspect --kind secret` shows key names only, never values. | `kubernetes-axi` | Secret values and embedded kubeconfig credentials were printed into agent context. |
| 14 | `--insecure` needs `ELASTICSEARCH_AXI_ALLOW_INSECURE=1`; curl limited to http(s); wildcard / `_all` deletes refused. | `elasticsearch-axi` | Disabled TLS and mass deletes were one flag away. |
| 15 | Local bridge requires a **per-session secret token** (constant-time compared, stored in a 0600 PID file); attaching to an existing browser (`AUTO_CONNECT`/`BROWSER_URL`) needs `CHROME_DEVTOOLS_AXI_ALLOW_ATTACH=1`; only a PID that `ps` identifies as the bridge is ever signalled. | `chrome-devtools-axi` | Any local process (or web page) could drive the logged-in browser through the unauthenticated bridge. |
| 16 | Removed `npx -y`/`@latest` fetch-on-demand from skills, wrapper bins and docs in the tools where it appeared. | `aws-axi`, `pg-axi`, `redis-axi`, `kubernetes-axi`, `msgraph-axi` and others | On-demand download of unreviewed packages. |
| 17 | Bearer tokens are now sent only to the vendor's own hosts: `slack-axi` file downloads (`assertSlackHttpsUrl`); the same fix was made in the since-removed `gws-axi`. | `slack-axi` | The URL came out of an API response and the token was attached with no host check. |
| 18 | `confluence-axi` refuses a non-Atlassian `--site` host (opt-out env `ATLASSIAN_AXI_ALLOW_ANY_SITE=1`). | `confluence-axi` | `--site` is chosen per call; a prompt-injected agent could send the stored API token (Basic auth) to any host. |
| 19 | `screencast-axi setup` runs the project's own installed Playwright CLI instead of `npx --yes playwright install`. | `screencast-axi` | Unpinned on-demand download. |
| 20 | Removed the vendored `.claude/skills/repo-triage` maintainer skill (it pre-authorised `gh issue comment/edit` against the author's repository and posts as "KimSia's firstmate"). | `cloudflare-axi` | Auto-discovered agent skill that acts on the author's repo. |

Supply-chain policy applied to the workspace (see [`pnpm-workspace.yaml`](pnpm-workspace.yaml), [`.npmrc`](.npmrc)): lifecycle scripts disabled everywhere (only `esbuild` allowed), 7-day minimum package age (strict), `trustPolicy: no-downgrade`, no git/tarball transitive dependencies.

Policy exceptions, each deliberate:

- `body-parser@2.4.0`, `fast-uri@3.1.9` are under 7 days old (published 2026-10-22 / 2026-10-19) but are the security fixes for published advisories. **Revisit after 2026-10-29.**
- `trustPolicyExclude`: `undici-types@6.21.0` (types-only, pinned by `@types/node@22`), `chokidar@4.0.3` (legitimate 4.x line used by `lavish-axi`), `langium@3.3.1` (dev-only).

## Dependency status

- Runtime-reachable known vulnerabilities (OSV.dev, 2026-10-24): **0** in 210 runtime packages.
- Dev-only advisories remain (vitest/vite/tinypool/mermaid build tooling, e.g. a critical `tinypool` prototype-pollution and a vitest UI-server issue). They are not shipped to users. **Do not run `vitest --ui`, `vite` dev servers, or the Vitest API server from these packages on machines that browse untrusted sites.**
- Re-run any time: `pnpm run audit:osv` (needs internet access to api.osv.dev).
- This only catches *known* vulnerabilities. It says nothing about undisclosed ones or about malicious new releases (the age and trust policies are the mitigations for the latter).
- Behavioural note: `@toon-format/toon` 2.3.1 prints an empty list as `key: []` where 2.1.0 printed `key[0]`. Anything that parses AXI output strictly should be checked.

## Risks that remain by design (decide before rollout)

These are inherent to what the tools do, not defects, but they matter in a corporate setting:

1. **Every tool acts with the developer's own credentials** against its target (GitHub, Slack, Google Workspace, AWS, Kubernetes, Postgres, Redis, Elasticsearch, Azure DevOps, Atlassian, Microsoft Graph, Metabase, Figma, Canva, Clockify, Cloudflare, Homebrew's public API). A prompt-injected agent using these tools can read and, where the tool allows, change those systems. Several tools gate mutations behind explicit flags (`--execute`, confirmations); that is a speed bump, not a security boundary. Use least-privilege tokens and read-only roles where possible.
2. **Agent-facing text is an injection surface.** `SKILL.md`, `AGENTS.md`, `CLAUDE.md`, playbooks and help text are instructions that agents read and may follow. They were reviewed for the `npx`/update behaviours above and where they contained code, but **not every instruction file was read for hostile or unwise guidance**. Review them before loading them into agents.
3. **`<tool> setup hooks`** (opt-in) writes SessionStart hooks into `~/.claude`, `~/.codex`, OpenCode and Copilot config so that a command runs at the start of every agent session. Nothing runs it automatically, but know what it does before allowing it.
4. **`chrome-devtools-axi` controls a real browser.** With `CHROME_DEVTOOLS_AXI_AUTO_CONNECT=1` or a `BROWSER_URL` it attaches to a browser that may hold logged-in sessions. Page content is untrusted input to the agent.
5. **`lavish-axi`**: runs a local web server (loopback by default) with an unauthenticated editor UI; artifacts it serves load some scripts/styles/fonts from public CDNs (`cdn.jsdelivr.net`, `esm.sh`) in the viewing browser. Consider an egress proxy allow-list or vendoring those assets.
6. **`confluence-axi`** stores OAuth tokens locally; **`atl-axi`** stores tokens via a native keychain module (`@napi-rs/keyring`, prebuilt binaries). File permissions and OAuth-app approval policy were not audited.
7. **`reactive-axi`** starts and proxies your development server and opens source files in an editor; **`screencast-axi`** drives Playwright and ffmpeg. Treat both as developer-workstation tools.
8. **Environment pass-through**: the wrapper tools (`aws-axi`, `pg-axi`, `redis-axi`, `kubernetes-axi`, ...) spawn the real CLI with the full process environment.
9. **Registry naming (dependency confusion):** the package names (`gh-axi`, `aws-axi`, ...) exist on the public npm registry. If you publish these to an internal registry, publish under a private scope (or set `"private": true`) and configure scope-to-registry mapping, otherwise a developer machine may install the public package instead.

## What was NOT done

- **Not every line was read by a person or by the reviewer.** A second, file-by-file pass logged all 492 runtime files in [`review/log.tsv`](review/log.tsv) (progress and method in [`review/README.md`](review/README.md); the items needing your decision are in [`review/MANUAL-REVIEW.md`](review/MANUAL-REVIEW.md)). Each log line says how the file was covered: **"Read in full"** (all credential, token, network, process-execution and server code: the SDK, `chrome-devtools-axi`, `lavish-axi` server and CLI, `slack-axi`, `atl-axi`, `confluence-axi`, `msgraph-axi`, `metabase-axi`, `cloudflare-axi` wrappers, and the wrapper chokepoints of `gh-axi`, `ado-axi`, `homebrew-axi`, `aws-axi`, `pg-axi`, `redis-axi`, `kubernetes-axi`, `elasticsearch-axi`); **"SINK-REGIONS-READ"** (about 80 files: every line that touches the filesystem, network, processes or environment was read in context); **"SCAN-ONLY"** (about 330 files, about half of all lines: Google/Slack/Jira/etc. command formatting and pure logic with no filesystem/network/process/environment access, checked by pattern only). In addition the whole non-test source was searched for `eval`, `new Function`, `atob`, `fromCharCode`, dynamic `import()` and every literal hostname (all remaining hits are documentation, demos or known behaviour). A malicious change hidden in pure-logic code that does none of these things could still have been missed.
- **No dynamic analysis.** No tool was run under a network monitor or sandbox. Recommended before broad rollout: run each tool you will deploy in a sandbox with traffic capture and confirm it contacts only the hosts it should.
- **Native / prebuilt binaries** pulled in by dependencies (`esbuild`, `@napi-rs/keyring`, Playwright/Chromium, Biome, oxlint, etc.) were not analysed; they are covered only by the registry's integrity hashes in the lockfile and the age/trust policy.
- **Upstream CI/CD, release and `.github` content was not vendored and not reviewed** (it is inert here).
- **Only the commits in `SOURCES.md` were reviewed.** Later upstream commits are unreviewed.
- Test status (Linux, Docker `node:22`): all packages pass except tests that cannot pass in the container: 4 `screencast-axi` tests need a Playwright Chromium download; 2 `lavish-axi` tests simulate failure with `chmod 000`, which does nothing for the container's root user. On Windows hosts, additional subprocess/symlink tests in the SDK and `lavish-axi` fail for platform reasons (symlink privileges, POSIX shims) - use WSL/Linux or the container script.
- **Excluded / not vendored:** `jev-axi` (sends repository content to a third-party hosted model by design), `quota-axi` (reads and uses stored credentials of many AI tools), `ado-axi` by jeffreyhaen (second implementation), and `specops` / `vercel-axi` (no license upstream, so they cannot be redistributed). Details in `SOURCES.md`.

## Reporting and maintenance

- Keep the `import(pristine)` commits untouched; they are the baseline for every future diff.
- Re-run `pnpm run audit:osv` on a schedule and before each rollout.
- Upstream updates: see "Updating from upstream" in the [README](README.md).
