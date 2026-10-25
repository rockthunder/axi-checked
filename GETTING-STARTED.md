# Getting started with the vetted AXI tools

This guide explains what AXI is, what is in this repository, what you need before installing, which API keys and tokens each tool uses, how to install everything, and ready-to-paste prompts for an AI coding agent: one prompt that installs it all, and one prompt per tool.

> Read [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md) and [`review/MANUAL-REVIEW.md`](review/MANUAL-REVIEW.md) before rolling any of this out. Several tools give an agent the ability to change real systems (mail, cloud, databases, Jira, Slack). Use least-privilege credentials.

Contents: [1. What AXI is](#1-what-axi-is) | [2. What this repo is](#2-what-this-repo-is) | [3. Benefits](#3-benefits) | [4. The tools](#4-the-tools) | [5. Prerequisites](#5-prerequisites) | [6. API keys and tokens](#6-api-keys-and-tokens-you-will-need) | [7. Install by hand](#7-install-by-hand) | [8. One-shot prompt](#8-one-shot-prompt-install-everything) | [9. Per-tool prompts](#9-per-tool-prompts) | [10. Verify, update, remove](#10-verify-update-remove) | [11. Troubleshooting](#11-troubleshooting)

---

## 1. What AXI is

**AXI (Agent eXperience Interface)** is a set of design rules for command-line tools that AI agents (Claude Code, Codex, OpenCode, Copilot CLI, ...) run through a shell. The idea: a CLI built for humans prints a lot of decoration, asks questions interactively and fails with vague errors. A CLI built for an agent should be cheap to read, predictable and safe to retry.

A tool that follows AXI typically:

- prints **compact, structured output** (the TOON format) with only the most useful fields by default and a `--fields`/`--full` switch for more;
- shows **useful live state when run with no arguments** (for example `gh-axi` lists your open work) instead of a help screen;
- **never prompts** interactively, and **fails loudly on unknown flags** so a typo is not silently ignored;
- returns **structured errors with a suggested next command**, and ends results with short "what to do next" hints;
- makes **mutations safe to repeat** (idempotent) and typically **dry-run by default** (you must add `--execute` or `--confirm` to change something);
- ships a tiny **skill** file that tells the agent the tool exists and to run `<tool> --help` for the rest.

Every `*-axi` tool is a small wrapper that follows these rules around something you already use: a vendor CLI (`gh`, `kubectl`, `psql`, `aws`, ...) or a vendor web API (Slack, Jira, Figma, ...).

## 2. What this repo is

This repository contains **21 AXI tools plus their shared library (`axi-sdk-js`)**. They are not the originals: each is a **security-reviewed, patched copy** of an open-source project, pinned to the exact upstream commit that was reviewed. The git history is the review trail (see [`README.md`](README.md)); every package links back to its original README and repository ([`SOURCES.md`](SOURCES.md)).

Compared with the upstream versions, this build:

- has **no self-update** (the upstream SDK ran `npm install -g <tool>@latest`),
- has **no telemetry** (usage events, Google usage statistics, CrUX lookups are removed or forced off),
- does **not download code on demand** (`npx -y ...` instructions are removed or replaced),
- has **hardened guards** where the upstream ones were weak (Postgres/Redis read-only checks, secret redaction, local-server tokens, tokens only sent to the vendor's own hosts),
- uses **one pinned dependency tree** with scripts disabled, a 7-day minimum package age and a vulnerability scan (0 known issues in runtime dependencies at review time).

## 3. Benefits

- **Fewer tokens, fewer mistakes.** Compact output and next-step hints mean an agent spends its context on the task, not on parsing prose.
- **Your own credentials, no middleman.** Each tool uses the vendor CLI login or the API token you give it and talks only to that vendor. No hosted proxy, no extra account.
- **Safer by default.** Mutations are dry-run or flag-gated; destructive actions need explicit confirmation; secrets are redacted from output.
- **Auditable.** Pinned upstream commits, a documented list of every change, a per-file review log and a list of items that need a human decision.
- **Works with any agent that can run shell commands.** Optional skills/hooks make agents discover the tools automatically.

## 4. The tools

| Tool | What it does | Wraps / talks to | Needs besides this repo |
|---|---|---|---|
| `gh-axi` | GitHub issues, PRs, runs, releases, repos, gists, secrets | `gh` CLI | `gh` installed and logged in |
| `aws-axi` | AWS inspection and guarded changes (aws, sam, cdk, terraform) | `aws`, optional `sam`/`cdk`/`terraform` | AWS CLI + credentials |
| `kubernetes-axi` | Cluster inspection and guarded changes | `kubectl` | `kubectl` + kubeconfig |
| `pg-axi` | Read-only Postgres exploration and queries | `psql` | `psql` + a database login |
| `redis-axi` | Redis inspection with a read-command allowlist | `redis-cli` | `redis-cli` + Redis login |
| `elasticsearch-axi` | Elasticsearch/OpenSearch inspect, query, guarded changes | `curl` over HTTP(S) | `curl` + cluster URL + key |
| `ado-axi` | Azure DevOps repos, pull requests, pipeline runs | `az` CLI | `az` + `azure-devops` extension + login |
| `msgraph-axi` | Microsoft 365 mail, calendar, users via Microsoft Graph | `m365` CLI (PnP) | `m365` CLI + login |
| `jira-axi` | Jira work items, boards, sprints | `acli` (Atlassian CLI) | `acli` + login |
| `atl-axi` | Jira Cloud via REST (issues, JQL, transitions, links) | Atlassian Cloud API | Atlassian API token |
| `confluence-axi` | Confluence pages, spaces, search | Atlassian Cloud API | Atlassian API token (or OAuth app) |
| `slack-axi` | Read, search and cite Slack; draft messages | Slack Web API | Slack app + user token |
| `metabase-axi` | Metabase search, cards, dashboards, SQL queries | Your Metabase server | Metabase URL + API key |
| `figma-axi` | Read Figma files, nodes, comments, exports | Figma REST API | Figma personal access token |
| `clockify-axi` | Time tracking: timers, entries, reports | Clockify API | Clockify API key |
| `cloudflare-axi` | Workers, KV, Pages, email routing, deployments | `wrangler` + Cloudflare API | `wrangler` + API token |
| `homebrew-axi` | Search/inspect Homebrew packages (read-only) | `brew` + formulae.brew.sh | Homebrew (macOS/Linux) |
| `chrome-devtools-axi` | Drive a Chrome browser: pages, snapshots, console, network | Chrome via a bundled MCP server | Google Chrome/Chromium |
| `lavish-axi` | Turn an agent's answer into a reviewable HTML page you can annotate | Local web server + your browser | A browser |
| `reactive-axi` | Click-to-source review of a running React/Vue/Svelte dev server | Your project's dev server | A web project with Vite/Next/CRA |
| `screencast-axi` | Scripted browser recordings of a site | Playwright + ffmpeg | Playwright, Chromium, ffmpeg |

Impact guide (what an injected or mistaken agent could do): **high** = `aws-axi`, `kubernetes-axi`, `cloudflare-axi`, `msgraph-axi` (can send mail), `slack-axi` (can post as you), `gh-axi`, `ado-axi`, `jira-axi`/`atl-axi`/`confluence-axi`, `chrome-devtools-axi`; **medium** = `pg-axi`, `redis-axi`, `elasticsearch-axi`, `metabase-axi`; **low** = the rest. Start with the low-impact tools and read-only credentials.

## 5. Prerequisites

On the machine where you build and install:

| Requirement | Why | Check |
|---|---|---|
| **Node.js 22 or newer** | All tools are Node programs | `node --version` |
| **pnpm 12** (the repo pins 12.14.0) | Dependency install and build | `pnpm --version` (install: `npm install -g pnpm@12.14.0`, or `corepack enable`) |
| **git** | To get and update this repo | `git --version` |
| **Network access to `registry.npmjs.org`** (TLS verified) | Downloads the pinned dependencies once | If your network intercepts TLS, set `NODE_EXTRA_CA_CERTS` to your corporate root certificate. Do not disable certificate checks. |
| **Python 3** (optional) | Only for `pnpm run audit:osv` and the review scripts | `python --version` |
| Windows, macOS or Linux | | On Windows use PowerShell or Git Bash. WSL/Linux is best for running the test suites. |

Per tool, the external programs and logins are in the tables in sections 4 and 6. Install those from **your organisation's approved sources** (they are separate software and were not reviewed here).

## 6. API keys and tokens you will need

**Rules for secrets (apply to every tool):**

- Create **least-privilege** tokens: read-only wherever possible, scoped to the projects/spaces/accounts that are actually needed, with an expiry.
- **Never paste a token into an AI chat.** Set it as an environment variable in your own terminal (or your secret manager / shell profile), or pipe it on stdin where a tool supports that. An agent should only be told *which variable* to expect.
- Avoid passing secrets as command-line arguments (they show up in process lists and shell history). Prefer environment variables or stdin.
- Never commit tokens. Several tools also store a token on disk (see "Stored where"); treat that file as a credential.

| Tool | What you must provide | How to get it | Variables / login command | Stored where |
|---|---|---|---|---|
| `gh-axi` | GitHub login (OAuth or fine-grained token) | `gh auth login` (or create a fine-grained PAT with only the repos and permissions needed) | `gh auth login`; optional `GH_TOKEN` | `gh`'s own store |
| `aws-axi` | AWS credentials or SSO profile | Your AWS access portal; prefer a read-only role | `aws sso login --profile <p>` and `AWS_PROFILE`, or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN`, `AWS_REGION` | AWS CLI's own store |
| `kubernetes-axi` | A kubeconfig context | Your cluster admin / cloud CLI | `KUBECONFIG` or default `~/.kube/config`; use a read-only RBAC role | kubeconfig |
| `pg-axi` | Postgres connection | A read-only database role | `DATABASE_URL` / `POSTGRES_URL`, or `PGHOST` `PGPORT` `PGUSER` `PGPASSWORD` `PGDATABASE`, or `PGSERVICE` | Not stored |
| `redis-axi` | Redis connection | A read-only Redis ACL user | `REDIS_URL` (or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`), `REDISCLI_AUTH` | Not stored |
| `elasticsearch-axi` | Cluster URL + API key (or basic auth) | Kibana/Elastic: create an API key with read-only privileges | `ELASTICSEARCH_URL` (or `ES_URL`), `ES_API_KEY` | Not stored |
| `ado-axi` | Azure login | `az login`, then `az extension add --name azure-devops` | `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_REPO` (optional; also read from the git remote) | Azure CLI's own store |
| `msgraph-axi` | Microsoft 365 sign-in via the `m365` CLI | Install the PnP CLI (`@pnp/cli-microsoft365`) from your approved source; run `m365 login` (device code). An Entra ID app registration may be required by your tenant; see the package README. Grant only the Graph permissions you need (for example omit `Mail.Send`). | `m365 login`; optional `MSGRAPH_AXI_M365_BIN` | `m365`'s own store |
| `jira-axi` | Jira login in `acli` | Install Atlassian's `acli`; run `acli jira auth login` | `acli jira auth login` | `acli`'s own store |
| `atl-axi` | Atlassian email + API token + site | https://id.atlassian.com/manage-profile/security/api-tokens (scoped token: `read:jira-work`, `write:jira-work`; add `read:jira-user` and the Jira Software board/sprint read scopes if needed) | `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`, `ATLASSIAN_SITE=<name>.atlassian.net`; or `<token-command> \| atl-axi auth login --site <site> --email <email> --token-stdin` | OS keychain |
| `confluence-axi` | Atlassian email + API token + site (or an OAuth 3LO app) | Same token page as above | `ATLASSIAN_SITE`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`; or `echo -n "<token>" \| confluence-axi auth login --token --site <site> --email <email>`; OAuth needs `ATLASSIAN_AXI_OAUTH_CLIENT_ID`/`_SECRET` from your own app | macOS Keychain, else a plaintext 0600 file in `~/.config/atlassian-axi` |
| `slack-axi` | Slack **user** token (`xoxp-...`) | `slack-axi auth setup` writes an app manifest; create the app from it in your workspace, install it, copy the *User OAuth Token*. Your Slack admin may need to approve the app. The scopes include reading all your conversations, so review them. | `SLACK_AXI_TOKEN` (+ `SLACK_AXI_TEAM`); or `slack-axi auth login --token ...` (puts the token on the command line; prefer the env var) | Plaintext 0600 JSON in `~/.config/slack-axi` if you use `auth login` |
| `metabase-axi` | Metabase URL + API key | Metabase Admin > Authentication > API keys (put the key in a group with read-only data access) | `METABASE_URL`, `METABASE_API_KEY` (or `metabase-axi auth add` which stores it) | Plaintext 0600 JSON in `~/.config/metabase-axi` if you use `auth add` |
| `figma-axi` | Figma personal access token | Figma > Settings > Security > Personal access tokens (read scopes only) | `FIGMA_TOKEN` | Env only (or a file you create) |
| `clockify-axi` | Clockify API key | Clockify > Preferences > Advanced > Manage API keys | `CLOCKIFY_API_KEY` | Env only |
| `cloudflare-axi` | Cloudflare API token | Cloudflare dashboard > My Profile > API Tokens (scope to the account/zone and the permissions you need) | `CLOUDFLARE_API_TOKEN`, optional `CLOUDFLARE_ACCOUNT_ID`. Without a token it falls back to `wrangler login`'s OAuth token, which is broad; prefer the scoped token. | Env (or wrangler's store) |
| `homebrew-axi` | nothing | | | |
| `chrome-devtools-axi` | nothing (a browser) | By default it launches its own isolated headless Chrome. Attaching to your real browser needs `CHROME_DEVTOOLS_AXI_ALLOW_ATTACH=1` plus `CHROME_DEVTOOLS_AXI_AUTO_CONNECT=1` or `CHROME_DEVTOOLS_AXI_BROWSER_URL`; leave that off unless you understand the risk. | | |
| `lavish-axi` | nothing | | | |
| `reactive-axi` | nothing | | | |
| `screencast-axi` | nothing for public sites; a saved browser session if you record signed-in pages | `screencast-axi auth login --interactive` | | A session file you choose; treat it as a credential |

## 7. Install by hand

All commands run from the root of this repository. The tools are installed **from your local checkout**, not from the public npm registry (never run `npx <tool>` or `npm i -g <tool>`: the public packages are different, unreviewed code).

```bash
# 1. Get the repo (or use your internal copy) and check out the reviewed version
git clone <your-internal-url>/axi-vetted.git
cd axi-vetted

# 2. Install dependencies exactly as locked (scripts are disabled by .npmrc)
pnpm install --frozen-lockfile

# 3. Build everything explicitly (nothing builds on install)
pnpm build

# 4. One-time: let pnpm manage a global bin folder and put it on PATH, then open a NEW terminal
pnpm setup
```

**5. Install the tools you want globally** (`pnpm add -g` with a local path links your checkout; `pnpm link --global` no longer works in pnpm 12):

```bash
pnpm add -g ./packages/gh-axi
pnpm add -g ./packages/slack-axi
# ... one line per tool, see the path table below
```

| Tool | Path to pass to `pnpm add -g` |
|---|---|
| `ado-axi` | `./packages/ado-axi-dtabolich` |
| `atl-axi` | `./packages/atl-axi` |
| `jira-axi` | `./packages/atlassian-axi/packages/jira-axi` |
| `confluence-axi` | `./packages/atlassian-axi/packages/confluence-axi` |
| `reactive-axi` | `./packages/reactive-axi/packages/reactive-axi` |
| every other tool | `./packages/<tool-name>` (for example `./packages/gh-axi`) |

On Windows PowerShell use backslashes or forward slashes; both work. Keep the checkout where it is: the global command points back at it.

**6. Install the vendor CLIs a tool wraps** (`gh`, `kubectl`, `psql`, `redis-cli`, `az`, `m365`, `acli`, `wrangler`, `brew`, Playwright, ffmpeg, ...) from your approved software source, then do the logins in section 6.

**7. Try it:**

```bash
gh-axi --version
gh-axi --help
gh-axi            # home view: live state
```

**Optional: make agents discover the tools.** `<tool> setup hooks` installs a SessionStart hook in your agent's configuration so the tool's home view is shown at the start of every session. It is opt-in, persistent and edits files under `~/.claude`, `~/.codex`, OpenCode and Copilot config. Read the note in `review/MANUAL-REVIEW.md` first; skip it if your policy does not allow it.

## 8. One-shot prompt (install everything)

Paste this into an AI coding agent that has shell access on the target machine. Replace `<REPO_PATH>` with the absolute path of your checkout of this repository, and edit the TOOLS line if you only want some tools.

````text
You are installing the security-reviewed AXI command-line tools from the repository at <REPO_PATH>. Work carefully and stop to ask me if anything is unclear. Do not skip steps and do not improvise around failures.

TOOLS: all of them (ado-axi, atl-axi, aws-axi, chrome-devtools-axi, clockify-axi, cloudflare-axi, confluence-axi, elasticsearch-axi, figma-axi, gh-axi, homebrew-axi, jira-axi, kubernetes-axi, lavish-axi, metabase-axi, msgraph-axi, pg-axi, reactive-axi, redis-axi, screencast-axi, slack-axi)

FIRST read <REPO_PATH>/GETTING-STARTED.md (sections 4-7 and 10) and <REPO_PATH>/SECURITY-REVIEW.md. They are the source of truth for paths, prerequisites and credentials.

HARD RULES
1. Install ONLY from the local checkout at <REPO_PATH>. Never run npx, never run "npm install -g <tool>" or "pnpm add -g <tool-name>" from a registry, never run curl|sh or irm|iex, never download code on demand.
2. Never ask me to paste a token, password or key into this chat, and never print one. If a credential is needed, tell me the exact environment variable or login command and wait while I set it up in my own terminal.
3. Do NOT run "<tool> setup hooks", "setup plugin", "pnpm approve", or edit any agent config files (~/.claude, ~/.codex, etc.) unless I explicitly ask.
4. Do not change any file inside <REPO_PATH>. Do not run package update commands. Use "pnpm install --frozen-lockfile" only.
5. Before installing any third-party program (gh, kubectl, psql, redis-cli, az, m365, acli, wrangler, brew, playwright, ffmpeg, Chrome), tell me what it is and ask. Use my organisation's approved install method; if you do not know it, ask me.
6. Do not run any command that changes a remote system (no deploys, no sends, no deletes). Verification must be read-only: "--version" and "--help" only, plus a read-only home view only when I say credentials are set.

STEPS
A. Prerequisites: check node (>=22), pnpm (12.x; if missing, tell me how to install and wait), git. Report the versions. Check that "pnpm setup" has been done (the pnpm global bin folder is on PATH); if not, run "pnpm setup", then tell me to open a new terminal and continue there.
B. In <REPO_PATH> run: pnpm install --frozen-lockfile. Then: pnpm build. Report any error verbatim and stop if the build fails.
C. For each tool in TOOLS run: pnpm add -g <path>, using the path table in GETTING-STARTED.md section 7. After each, run "<tool> --version" and report PASS or FAIL. Continue with the others if one fails and list failures at the end.
D. Build a prerequisites report as a table with one row per tool: the external program it wraps (is it installed? version?), and the credential it needs (variable name or login command from GETTING-STARTED.md section 6) with status "set" or "not set". Check variables only by testing whether they exist; never print their values. Do not install missing programs without asking.
E. Give me a short checklist of what I still have to do by hand (logins, tokens to create, approvals), ordered from lowest to highest impact, and highlight the high-impact tools (aws, kubernetes, cloudflare, msgraph, slack, gh, ado, jira/atl/confluence, chrome-devtools) with the advice to use least-privilege credentials.
F. Finish with a summary: installed tools with versions, failures, missing prerequisites, and the exact commands I should run next. Do not claim anything works that you did not verify.
````

## 9. Per-tool prompts

Use one of these when you only want one tool. Replace `<REPO_PATH>` with your checkout path. Each prompt inherits the safety rules: install only from the local checkout, never ask for secrets in chat, no hooks, no remote changes.

**Common preface** (put this above any of the prompts below, or prepend it once to the conversation):

````text
Context: security-reviewed AXI tools live at <REPO_PATH>. Read <REPO_PATH>/GETTING-STARTED.md sections 5-7 first. Rules: install only from the local checkout with "pnpm add -g <path>" (never npx, never a registry install of the tool, never curl|sh); never ask me to paste a token or password into this chat and never print one - tell me which environment variable or login command to use and wait; do not run "setup hooks"/"setup plugin" or edit agent config; ask before installing any third-party program; verify with "--version" and "--help" only; make no changes to remote systems. If the repo has not been prepared yet, run in <REPO_PATH>: pnpm install --frozen-lockfile, then pnpm build, then make sure "pnpm setup" has been done (global bin on PATH).
````

### gh-axi (GitHub)

````text
Install gh-axi: run "pnpm add -g ./packages/gh-axi" in <REPO_PATH>, then "gh-axi --version". Check that the GitHub CLI "gh" is installed (ask before installing it) and whether "gh auth status" is logged in; if not, tell me to run "gh auth login" myself, preferably with a fine-grained token limited to the repos I need. Do not run any gh-axi command that creates, edits, merges or deletes anything. Report the results.
````

### aws-axi (AWS)

````text
Install aws-axi: run "pnpm add -g ./packages/aws-axi" in <REPO_PATH>, then "aws-axi --version". Check that the AWS CLI is installed (and whether sam, cdk or terraform are, since aws-axi can wrap them), and whether an AWS profile or SSO session is configured - tell me the AWS_PROFILE / AWS_REGION values I should set, without printing credentials. Remind me to use a read-only role. Do not run "plan" or "apply" or anything with --execute.
````

### kubernetes-axi (kubectl)

````text
Install kubernetes-axi: run "pnpm add -g ./packages/kubernetes-axi" in <REPO_PATH>, then "kubernetes-axi --version". Check that kubectl is installed and list the context NAMES from my kubeconfig (names only, never the file contents). Recommend a read-only context. Do not run exec, apply, delete, scale or clean.
````

### pg-axi (PostgreSQL)

````text
Install pg-axi: run "pnpm add -g ./packages/pg-axi" in <REPO_PATH>, then "pg-axi --version". Check that "psql" is installed. Tell me which environment variables to set for the connection (DATABASE_URL, or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE, or PGSERVICE) and recommend a read-only database role. Do not run any query until I confirm the variables are set, and then run only "pg-axi doctor".
````

### redis-axi (Redis)

````text
Install redis-axi: run "pnpm add -g ./packages/redis-axi" in <REPO_PATH>, then "redis-axi --version". Check that "redis-cli" is installed. Tell me which environment variables to set (REDIS_URL, or REDIS_HOST/REDIS_PORT, and REDISCLI_AUTH for the password) and recommend a read-only ACL user. Do not run create, set, delete, flush or any write command.
````

### elasticsearch-axi (Elasticsearch / OpenSearch)

````text
Install elasticsearch-axi: run "pnpm add -g ./packages/elasticsearch-axi" in <REPO_PATH>, then "elasticsearch-axi --version". Check that "curl" is installed. Tell me to set ELASTICSEARCH_URL and ES_API_KEY in my own terminal (an API key with read-only privileges). Do not use --insecure and do not run anything with --execute. After I confirm, you may run "elasticsearch-axi doctor".
````

### ado-axi (Azure DevOps)

````text
Install ado-axi: run "pnpm add -g ./packages/ado-axi-dtabolich" in <REPO_PATH>, then "ado-axi --version". Check that the Azure CLI "az" is installed and that its "azure-devops" extension is present ("az extension list"); ask before adding the extension. Tell me to run "az login" myself and to set AZURE_DEVOPS_ORG / AZURE_DEVOPS_PROJECT if needed. Do not run pr create/update/complete or the "api" command.
````

### msgraph-axi (Microsoft 365)

````text
Install msgraph-axi: run "pnpm add -g ./packages/msgraph-axi" in <REPO_PATH>, then "msgraph-axi --version". It wraps the PnP "m365" CLI (@pnp/cli-microsoft365): check whether "m365" is installed; if not, ask me for the approved way to install it. Tell me to run "m365 login" (device code) myself; do not use --secret or --password flags. Remind me that mail send/delete and the "raw" command can change data and that the Graph app permissions should be minimal. Run nothing with --execute.
````

### jira-axi (Jira via acli)

````text
Install jira-axi: run "pnpm add -g ./packages/atlassian-axi/packages/jira-axi" in <REPO_PATH>, then "jira-axi --version". It wraps Atlassian's "acli": check whether it is installed (ask me for the approved way to install it if not) and tell me to run "acli jira auth login" myself. Do not create, edit, transition or delete any work item.
````

### atl-axi (Jira Cloud via REST)

````text
Install atl-axi: run "pnpm add -g ./packages/atl-axi" in <REPO_PATH>, then "atl-axi --version". Explain how I create a scoped Atlassian API token at https://id.atlassian.com/manage-profile/security/api-tokens (scopes read:jira-work, write:jira-work, plus read:jira-user and the Jira Software board/sprint read scopes if needed) and the two ways to give it to atl-axi: environment variables ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_SITE (<name>.atlassian.net), or "<token-command> | atl-axi auth login --site <site> --email <email> --token-stdin" run by me in my terminal. Never ask me for the token. Do not run the "api" command or any create/edit/transition/link command.
````

### confluence-axi (Confluence)

````text
Install confluence-axi: run "pnpm add -g ./packages/atlassian-axi/packages/confluence-axi" in <REPO_PATH>, then "confluence-axi --version". Explain the credential options (ATLASSIAN_SITE, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN, or "echo -n \"<token>\" | confluence-axi auth login --token --site <site> --email <email>" run by me) and tell me that on Windows/Linux the token is stored in a plaintext 0600 file under ~/.config/atlassian-axi unless I use the environment variables instead. Never ask me for the token. Do not create, update or delete pages.
````

### slack-axi (Slack)

````text
Install slack-axi: run "pnpm add -g ./packages/slack-axi" in <REPO_PATH>, then "slack-axi --version". Run "slack-axi auth setup" and walk me through creating the Slack app from the generated manifest (tell me the manifest and setup page paths it prints). Warn me that the user-token scopes can read all my conversations including DMs and that my Slack admin may need to approve the app. Tell me to put the User OAuth Token in the environment variable SLACK_AXI_TOKEN in my own terminal; never ask me to paste it here and do not use "auth login --token". Do not run "draft send" or "react".
````

### metabase-axi (Metabase)

````text
Install metabase-axi: run "pnpm add -g ./packages/metabase-axi" in <REPO_PATH>, then "metabase-axi --version". Tell me to create an API key in Metabase (Admin > Authentication > API keys) in a group with read-only data access, and to set METABASE_URL and METABASE_API_KEY in my terminal. Warn that "query" runs arbitrary SQL with the key's database permissions. After I confirm the variables are set, run only "metabase-axi doctor".
````

### figma-axi (Figma)

````text
Install figma-axi: run "pnpm add -g ./packages/figma-axi" in <REPO_PATH>, then "figma-axi --version". Tell me to create a Figma personal access token with read-only scopes (Settings > Security) and set FIGMA_TOKEN in my terminal. Never ask me to paste it here. Report when ready.
````

### clockify-axi (Clockify)

````text
Install clockify-axi: run "pnpm add -g ./packages/clockify-axi" in <REPO_PATH>, then "clockify-axi --version". Tell me to create an API key (Clockify > Preferences > Advanced > Manage API keys) and set CLOCKIFY_API_KEY in my terminal. Never ask me for it. Do not start, stop or delete any timer or entry.
````

### cloudflare-axi (Cloudflare)

````text
Install cloudflare-axi: run "pnpm add -g ./packages/cloudflare-axi" in <REPO_PATH>, then "cloudflare-axi --version". It wraps "wrangler": check whether wrangler is installed (ask me for the approved install method if not). Tell me to create a scoped Cloudflare API token (only the account/zone and permissions I need) and set CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID if I have several accounts) in my terminal, and NOT to rely on "wrangler login" because its token is broad. Do not deploy, put, delete, or change email routing.
````

### homebrew-axi (Homebrew)

````text
Install homebrew-axi: run "pnpm add -g ./packages/homebrew-axi" in <REPO_PATH>, then "homebrew-axi --version". Check that "brew" is installed. No credentials are needed and the tool only runs read-only brew commands. Run "homebrew-axi --help" and report.
````

### chrome-devtools-axi (browser automation)

````text
Install chrome-devtools-axi: run "pnpm add -g ./packages/chrome-devtools-axi" in <REPO_PATH>, then "chrome-devtools-axi --version". Check that Google Chrome or Chromium is installed. Do NOT set CHROME_DEVTOOLS_AXI_ALLOW_ATTACH, CHROME_DEVTOOLS_AXI_AUTO_CONNECT or CHROME_DEVTOOLS_AXI_BROWSER_URL: I want the default isolated headless browser only. Warn me that the "run" command executes arbitrary code and that agents should be denied "chrome-devtools-axi run" in their permission rules. Verify with "--help" only.
````

### lavish-axi (HTML review pages)

````text
Install lavish-axi: run "pnpm add -g ./packages/lavish-axi" in <REPO_PATH>, then "lavish-axi --version". No credentials are needed. Tell me that it runs a local web server on 127.0.0.1 and that its design guidance makes pages load some assets from cdn.jsdelivr.net and esm.sh in my browser, so my network policy may need to allow or block those. Verify with "--help" only; do not open a session.
````

### reactive-axi (live dev-server review)

````text
Install reactive-axi: run "pnpm add -g ./packages/reactive-axi/packages/reactive-axi" in <REPO_PATH>, then "reactive-axi --version". No credentials are needed. Warn me that it starts the target project's own dev server (Vite, Next.js or Create React App), so I should only point it at projects I trust. Verify with "--help" only.
````

### screencast-axi (browser recordings)

````text
Install screencast-axi: run "pnpm add -g ./packages/screencast-axi" in <REPO_PATH>, then "screencast-axi --version". It needs Playwright and ffmpeg in the project where I record: check whether they are installed and tell me the approved way to add them (Playwright's Chromium download comes from Playwright's CDN, so ask me first). Do not run "setup" or record anything until I confirm. Verify with "--help" only.
````

## 10. Verify, update, remove

- **Verify everything installed:** `for t in gh-axi slack-axi ...; do $t --version; done` (PowerShell: `foreach ($t in 'gh-axi','slack-axi') { & $t --version }`).
- **Re-scan for known vulnerabilities:** `pnpm run audit:osv` (needs internet access to api.osv.dev).
- **Run the test suites on Linux:** see [`scripts/test-linux.sh`](scripts/test-linux.sh).
- **Update:** never bump versions casually. Follow "Updating from upstream" in [`README.md`](README.md): diff the new upstream release against the pinned commit, re-review it, re-apply or drop each local patch, re-scan, re-test.
- **Remove a tool:** `pnpm remove -g <tool-name>`.
- **Where state lives:** most tools keep configuration under `~/.config/<tool>/` (Windows: your user profile), `lavish-axi`/`reactive-axi` under `~/.lavish-axi` / `~/.reactive-axi`. Delete those folders to clear stored tokens, caches and sessions.

## 11. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `command not found` after install | Run `pnpm setup`, open a **new** terminal, and check that the pnpm global bin folder is on PATH. |
| `pnpm link --global` fails | That form no longer works in pnpm 12. Use `pnpm add -g ./packages/<tool>`. |
| `ERR_PNPM_...` frozen lockfile error | Do not edit `package.json` or `pnpm-workspace.yaml`. Re-clone or `git checkout .`, then `pnpm install --frozen-lockfile`. |
| Install blocked by "minimum release age" | Intended supply-chain policy (7 days). The few exceptions are documented in `pnpm-workspace.yaml`. |
| TLS / certificate errors fetching dependencies | Set `NODE_EXTRA_CA_CERTS` to your corporate root CA file. Do not disable certificate checks. |
| "agent skills awaiting approval" message from pnpm | Leave unapproved (`chrome-devtools-mcp`, `ultracite`); they are not needed. |
| A tool says its wrapped program "is not installed" | Install the vendor CLI (`gh`, `kubectl`, `psql`, `az`, `m365`, `acli`, `wrangler`, ...) from your approved source. |
| Authentication errors | Re-check the variable names in section 6 and token scopes; for `atl-axi` a 401 usually means a missing scope. |
| `<tool> update` | Self-update is disabled in this build by design. Update by re-running the reviewed upgrade process. |
| Some tests fail on Windows | Known (symlink privileges, POSIX shims). Use WSL/Linux or `scripts/test-linux.sh`. |

More detail: [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md) (what was changed and what remains risky), [`SOURCES.md`](SOURCES.md) (upstream links), [`review/MANUAL-REVIEW.md`](review/MANUAL-REVIEW.md) (items needing a human decision).
