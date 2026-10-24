# Items for a human to review

Generated from `review/log.tsv` by `python -I scripts/review-status.py render-manual`. **MANUAL** = high risk or unsure: please look yourself. **NOTE** = minor, benign-but-worth-knowing.

## MANUAL - needs your review

- `packages/ado-axi-dtabolich/src/az.ts`
  Read in full. Wrapper around the Azure CLI: execFile('az', argv; env passthrough) with the user's az login (and the azure-devops extension). No credentials of its own. 'az devops invoke' is exposed generically.
- `packages/ado-axi-dtabolich/src/commands/api.ts`
  Read in full. 'api' = generic Azure DevOps REST escape hatch (az devops invoke) with any area/resource and method GET/POST/PATCH/PUT/DELETE and a JSON body; NO --confirm/--execute gate for writes or deletes.
- `packages/ado-axi-dtabolich/src/commands/setup.ts`
  SCAN-ONLY (no fs/network/process/env sinks): 'setup hooks' installs persistent SessionStart hooks via axi-sdk-js.
- `packages/atl-axi/src/commands/api.ts`
  Read in full. Generic escape hatch: GET/POST/PUT/DELETE against ANY /rest/ Jira endpoint with the user's token (DELETE needs --confirm, POST/PUT do not). Lets an agent do anything the token's scopes allow; scope the API token narrowly or consider disabling this command.
- `packages/atl-axi/src/commands/setup.ts`
  Read in full. 'setup hooks' installs persistent SessionStart hooks (user scope = every session) via axi-sdk-js; uninstall/status provided. See axi-sdk-js hooks.ts MANUAL entry.
- `packages/atlassian-axi/packages/jira-axi/src/acli.ts`
  Read in full. Shells out to the Atlassian CLI 'acli' via execFile (argv only, no shell, 15s timeout) and inherits whatever Jira login acli holds (acli installed separately via brew etc. - audit that binary too). jira-axi itself holds no credentials.
- `packages/aws-axi/bin/aws-axi.js`
  Wrapper over aws/sam/cdk/terraform via spawnSync (no shell). TRUST BOUNDARY: 'plan' is described as non-mutating but runs argv arrays taken from <cwd>/aws-axi.config.json (targets[].commands.plan / .deploy), so running 'aws-axi plan' (no --execute) in an untrusted repo executes whatever programs that repo's config names; 'terraform plan' also executes repo terraform (external data sources/providers). 'apply --execute' uses non-interactive flags (terraform -auto-approve, cdk --require-approval never, sam --no-confirm-changeset); production needs --confirm-account. Full process.env passed to children; findExecutable() treats an empty PATH entry as cwd. sanitize() redaction is regex-only. Hook install writes unquoted 'node <path>' commands. Suggested hardening: only honour custom commands when --execute is given, or only from a trusted config path. Skill text had 'npx -y aws-axi' (fixed in commit 'remove remaining npx').
- `packages/axi/packages/axi-sdk-js/src/hooks.ts`
  Explicit opt-in (setup hooks) but powerful and persistent: writes SessionStart hooks into ~/.claude/settings.json, ~/.codex/hooks.json (or project .claude/.codex), an OpenCode plugin, and ENABLES the global [features] hooks=true flag in ~/.codex/config.toml. Hook command is an unquoted exec path or a bare binary name resolved through PATH at every agent session start (PATH-hijack / spaces-in-path risk); command-substring match (includes(marker)) can overwrite an unrelated hook that merely mentions the tool name. No network. Decide whether your org allows 'setup hooks' at all (or remove the call from each tool's setup command).
- `packages/chrome-devtools-axi/src/cli.ts`
  Read in full (1870 lines). Mostly command plumbing. NEEDS YOUR DECISION - inherent capabilities an injected agent can abuse: (1) open/newpage/page.open take ANY URL scheme incl. file:// (local files into snapshots), chrome://, intranet URLs and javascript: - there is no scheme allowlist; (2) upload @uid <path> sends ANY local file to whatever site the page posts to; (3) screenshot/heap/perf/network-get --file/lighthouse write to ANY absolute path (resolveOutputPath only resolves relative paths) and the client widens the MCP file roots to that path - an agent can overwrite user files; (4) eval/run execute arbitrary JS in the page (and 'run' in the CLI process, see run.ts). Consider denying these in your agent permission rules, or restricting URL schemes and output directories.
- `packages/chrome-devtools-axi/src/run.ts`
  'chrome-devtools-axi run' writes the stdin script to a temp .mjs and import()s it INSIDE THE CLI PROCESS. The documented API is the 'page' global, but the script is ordinary unsandboxed Node code (fs, child_process, network, env). So 'run' == arbitrary local code execution. If your agent permission rules allow 'chrome-devtools-axi *' they implicitly allow arbitrary code, bypassing any per-command shell restrictions. Decide: deny 'chrome-devtools-axi run' in agent permissions, or remove the command from this build. (Temp dir is created 0700 via mkdtemp - fine.)
- `packages/cloudflare-axi/src/commands/email.ts`
  SCAN-ONLY (no fs/network/process/env sinks): . Email Routing writes: can create forwarding rules/catch-all routing to a (verified) destination address and enable routing on a zone. A prompt-injected agent could set up mail forwarding. Restrict by policy.
- `packages/cloudflare-axi/src/commands/kv.ts`
  SINK-REGIONS-READ: . KV get/put/delete/drop (drop deletes a whole namespace with --skip-confirmation semantics via the wrapper). Data-destructive on a live account.
- `packages/cloudflare-axi/src/commands/workers.ts`
  SCAN-ONLY (no fs/network/process/env sinks): . workers deploy / delete / secret put|delete using the user's Cloudflare credentials (delete is gated by a dependents check unless --force). Production-impacting; no environment/account confirmation beyond flags.
- `packages/cloudflare-axi/src/credentials.ts`
  Read in full. Besides CLOUDFLARE_API_TOKEN it READS ANOTHER TOOL'S CREDENTIAL STORE: the OAuth token that 'wrangler login' wrote to ~/.wrangler/config/default.toml (or XDG / macOS Preferences equivalents) and uses it for direct REST calls (sent only to api.cloudflare.com). That token carries wrangler's default login scopes, which are broad. Decide whether to disable the wrangler-OAuth fallback and require an explicit scoped CLOUDFLARE_API_TOKEN.
- `packages/cloudflare-axi/src/wrangler.ts`
  Read in full. Runs the 'wrangler' binary found on PATH via execFile/spawn (argv only, no shell; env passthrough; detached process group for tail). It is the main execution surface: deploy, delete, secret put, kv writes, pages deploy all run wrangler with the user's Cloudflare login. Audit/pin the wrangler you install.
- `packages/figma-axi/src/figma/token.ts`
  Read in full. Token from FIGMA_TOKEN or plaintext {"token":...} in ~/.config/figma-axi/config.json (never written by the tool; user-created). Never printed. Prefer env.
- `packages/gh-axi/src/commands/api.ts`
  Read first 160 lines. Generic 'gh api' escape hatch: ANY endpoint, GET/POST/PUT/PATCH/DELETE, --field/--input bodies (e.g. branch protection, deploy keys, webhooks) with no confirmation gate.
- `packages/gh-axi/src/commands/gist.ts`
  Pattern-scanned. 'gist create --public' publishes content to the public internet (exfil path); --secret gists are unlisted but link-readable.
- `packages/gh-axi/src/commands/setup.ts`
  SCAN-ONLY (no fs/network/process/env sinks): 'setup hooks' installs persistent SessionStart hooks via axi-sdk-js.
- `packages/gh-axi/src/gh.ts`
  Read in full. Single chokepoint that runs the GitHub CLI 'gh' (execFile, argv only; binary overridable with GH_BIN env) with the user's gh login; optional stdin for secret values. gh-axi holds no credentials; its blast radius is whatever your gh token can do. Audit/pin the gh you install.
- `packages/gws-axi/src/auth/scopes.ts`
  Read in full. Requested OAuth scopes are very broad: gmail.modify, calendar, documents, drive (full), presentations, spreadsheets, chat.messages (read+send+edit/delete), chat.memberships.readonly, chat.users.readstate, drive.activity.readonly, directory.readonly, gmail.settings.basic. Restrictions such as 'no gmail send' and 'no public sharing' are enforced only in CLI code, not by the token. Decide whether this scope set is acceptable for corporate use; consider trimming.
- `packages/gws-axi/src/commands/chat/send.ts`
  Can post arbitrary text (inline, stdin or --file, any local file readable by the user) to any Chat space/DM the account can reach, including spaces with external members. Exfiltration-capable for a prompt-injected agent. Only egress is Google Chat API.
- `packages/gws-axi/src/commands/drive/share.ts`
  Read (first 200 lines). Refuses anyone/domain sharing (good) but will share any file with ANY named external email address as reader/commenter/writer, with no domain allowlist. Exfiltration-capable for a prompt-injected agent; consider a domain allowlist.
- `packages/gws-axi/src/commands/drive/upload.ts`
  Read key sections. Uploads any local file path (or stdin/--content) the user can read into the account's Drive; combined with drive share this is an exfil path. Only egress is Drive API.
- `packages/gws-axi/src/commands/gmail/filters.ts`
  Persistent-rule primitive: 'gmail filter-create --forward <addr>' creates an auto-forwarding Gmail filter (Gmail itself only allows verified forwarding addresses). An injected agent could set up silent mail forwarding. Consider removing --forward or restricting by policy. Otherwise only Google API calls.
- `packages/gws-axi/src/commands/setup.ts`
  Read in full. 'setup hooks' installs persistent SessionStart hooks via axi-sdk-js installSessionStartHooks (same hook-writing behaviour flagged in packages/axi/axi-sdk-js/src/hooks.ts).
- `packages/gws-axi/src/google/tokens.ts`
  Read in full. OAuth access+refresh tokens stored as PLAINTEXT JSON at ~/.config/gws-axi/accounts/<email>/tokens.json (mode 0600 only at file creation; directory not chmod'ed). Refresh goes only to oauth2.googleapis.com. Decide whether plaintext-at-rest tokens are acceptable (no OS keychain use).
- `packages/homebrew-axi/src/commands/setup.ts`
  SCAN-ONLY (no fs/network/process/env sinks): 'setup hooks' installs persistent SessionStart hooks via axi-sdk-js.
- `packages/kubernetes-axi/bin/kubernetes-axi.js`
  Read in full. FIXED: (1) 'config view' used 'kubectl config view --raw' (real credentials then regex-redacted) -> no --raw; (2) 'inspect --kind secret' used regex redaction of YAML (last-applied-configuration annotation repeats the secret) -> key names only. NEEDS YOUR DECISION: (a) TRUST BOUNDARY as in aws-axi: 'plan' (no --execute) runs argv taken from <cwd>/kubernetes-axi.config.json (targets[].commands.plan) and 'helm template'/'kubectl kustomize' on repo content, so running it in an untrusted repo executes repo-chosen programs; (b) 'apply/delete/scale/exec --execute' act on whatever kube CONTEXT is current with no production/context confirmation (aws-axi at least requires --confirm-account for production); (c) 'clean --kind pods|jobs --execute' deletes ALL pods/jobs in the namespace with no --confirm; (d) 'exec --execute' can read anything inside a pod (service-account tokens, env) - output is only pattern-redacted. Other: full process.env passed to kubectl/helm; hooks install writes unquoted 'node <path>'; script has an sh/node polyglot shebang (benign).
- `packages/lavish-axi/src/cli.js`
  Read in full. No telemetry/phone-home (open pkg only launches local browser; all fetches go to the local server). MANUAL: 'setup hooks' writes persistent SessionStart hooks into Claude/Codex/OpenCode and ~/.copilot/hooks/lavish-axi.json (spawnSync shell:true, PATH-resolved 'lavish-axi'); 'setup plugin' edits VS Code settings (chat.pluginLocations), symlinks into ~/.cursor, runs 'copilot plugin install' - all explicit opt-in. startServer spawns a detached daemon (process.execPath). Kill of old server only via lsof+ps match on 'lavish-axi' (SIGTERM, same-installation fallback). NOTE: help/home text still advertises ht-ml.app share although shareCommand is disabled (my patch); shareCommandUpstream is dead code; export --out / --agent-reply-file read/write user-chosen paths (user-driven).
- `packages/lavish-axi/src/design-reference.js`
  Read in full. No code runs in the CLI, but it emits agent-facing guidance + snippets that make generated artifacts load third-party JS/CSS at view time from cdn.jsdelivr.net (tailwind browser 4.2.4, daisyui 5.5.19, mermaid 11.15.0). Versions are pinned but there is no SRI and no internal mirror. Decide whether your policy allows CDN loads in reviewers' browsers; if not, vendor these or edit the snippets. Text is also steering agent behaviour (MUST/strict-priority wording): benign design guidance, no hidden instructions found.
- `packages/lavish-axi/src/playbooks.js`
  Read in full. Agent-facing guidance text only. The 'code' playbook instructs agents to import @pierre/diffs from https://esm.sh/@pierre/diffs@1.2.10?bundle (version pinned but esm.sh ?bundle pulls unpinned transitive deps, no SRI) into artifacts. Same CDN policy decision as design-reference.js. No hidden instructions or exfil patterns found.
- `packages/lavish-axi/src/server.js`
  Local HTTP API unauthenticated on loopback: Host allowlist + Origin guard are sound, but header-less requests are accepted, so any local process/user can POST /api/sessions for any .html path, read its directory via /artifact/, call /shutdown. Session key is a path hash, not a secret. Dead code after early 403 in share route (my patch); autoTailscale=false (my patch); chrome UI still shows a 'Publish link' menu item that now errors. Whiteboard HMAC, WS Origin/Host checks, artifact CSP sandbox, XFO DENY all OK.
- `packages/metabase-axi/src/commands/auth.ts`
  Read in full. 'auth add' takes --api-key / --password as COMMAND-LINE ARGUMENTS (visible in process list and shell history), then validates and stores them plaintext.
- `packages/metabase-axi/src/commands/query.ts`
  Read header + options. 'query' runs arbitrary native SQL / MBQL against any database the credentials can reach, with NO read-only guard in the CLI (writes depend entirely on the database role Metabase uses). Also writes full results to --json-out/--csv-out/--xlsx-out paths. Use a Metabase user limited to read-only connections.
- `packages/metabase-axi/src/commands/setup.ts`
  SCAN-ONLY (no fs/network/process/env sinks): 'setup hooks' installs persistent SessionStart hooks via axi-sdk-js (see SDK hooks.ts MANUAL entry).
- `packages/metabase-axi/src/config.ts`
  Read in full. Metabase API keys, or username+PASSWORD, plus cached session tokens are stored as PLAINTEXT JSON in ~/.config/metabase-axi/config.json (dir 0700 / file 0600 at creation). Decide whether plaintext at rest is acceptable; prefer env-supplied API keys of a read-only Metabase user.
- `packages/msgraph-axi/src/backend.ts`
  Read in full. msgraph-axi is a thin wrapper that runs the separately installed PnP 'm365' CLI (@pnp/cli-microsoft365) via cross-spawn (argv, no shell on POSIX; on Windows through the .cmd shim) and inherits its Microsoft 365 login/token cache. Binary can be overridden with MSGRAPH_AXI_M365_BIN. msgraph-axi stores no credentials itself. Audit the m365 CLI you install (error text even suggests 'npm i -g @pnp/cli-microsoft365' on demand). Temp JSON payload files are written under os.tmpdir() on Windows and removed afterwards.
- `packages/msgraph-axi/src/commands/auth.ts`
  Read in full. 'auth login' supports --auth-type secret|password|certificate and forwards --secret / --password / certificate material to m365 as COMMAND-LINE ARGUMENTS (visible in process lists / shell history). Prefer device-code login; do not use --secret/--password flags.
- `packages/msgraph-axi/src/commands/mail.ts`
  Pattern-scanned + key lines read. Can SEND mail (mail send --draft <id> --execute, or draft with --send --execute) and delete messages (--execute --confirm <id>). Unlike gws-axi, sending is implemented: a prompt-injected agent could mail data out. Restrict via Graph app permissions (omit Mail.Send) or policy.
- `packages/msgraph-axi/src/commands/mailflow.ts`
  SINK-REGIONS-READ: . Draft/attachment flows: reads local files to attach and writes downloaded attachments (readFileSync/writeFileSync) - local file read -> mailbox exfil path (draft, then send via mail.ts).
- `packages/msgraph-axi/src/commands/raw.ts`
  Read in full. 'raw' = arbitrary Microsoft Graph request (any path, GET/POST/PUT/PATCH/DELETE, body from argument or @file). Writes need --execute (a flag the agent itself passes), so it is a weak guard. Combined with the token's Graph permissions this can read or change anything the signed-in user can.
- `packages/reactive-axi/packages/reactive-axi/src/cli.js`
  Pattern-scanned. Starts a detached control-server daemon (process.execPath), probes/stops existing servers via /health,/shutdown and lsof+ps matching (SIGTERM only on a matched reactive-axi process), opens the browser. 'setup hooks'/plugin helpers like the lavish CLI.
- `packages/reactive-axi/packages/reactive-axi/src/dev-server-manager.js`
  Read in full. Spawns the TARGET PROJECT's own dev server (node_modules/.bin/vite, next, react-scripts' webpack-dev-server) via cross-spawn and waits for it on a loopback port. Running reactive-axi on an untrusted repository executes that repository's dev tooling and config (same trust model as 'npm run dev').
- `packages/reactive-axi/packages/reactive-axi/src/framework-adapters/vite.js`
  Read in full. Writes a wrapper vite config INSIDE the project (.reactive-axi/vite.config.<session>.mjs, removed on cleanup) that imports the project's real vite.config and merges host/port/hmr overrides, then runs 'vite --config <wrapper>'. Executes project config code.
- `packages/reactive-axi/packages/reactive-axi/src/server.js`
  Pattern-scanned + bind/host logic read. Lavish-derived control server: Host header allowlist (loopback names + configured hosts; LAVISH-style '*' opt-out exists) but the HTTP API is otherwise unauthenticated on loopback (any local process can open sessions for any project dir and drive them). No telemetry/outbound fetches found. Listen host is configurable; wildcard binds are excluded from the allowlist.
- `packages/screencast-axi/src/auth/strategies.ts`
  Read in full. Auth strategies: persistent Chrome profile (human signs in once), Playwright storageState JSON (cookies/tokens in a file; can be written with 'auth login --interactive --save-state <path>'), and HTTP basic auth (password in config). Session files are credentials: protect them, never commit.
- `packages/screencast-axi/src/browser.ts`
  Pattern-scanned. Launches Chromium via Playwright (headless or persistent profile) against configured URLs, records video/screenshots of whatever the scenario visits - may capture sensitive page content; browser traffic is outside this review.
- `packages/screencast-axi/src/config.ts`
  SINK-REGIONS-READ: . Loads screencast.config.* from the project (executable TypeScript via tsx).
- `packages/screencast-axi/src/resolve.ts`
  Read in full. Loads modules (playwright, tsx, ffmpeg-static) from the CONSUMING PROJECT's node_modules by resolving from the current working directory, and screencast-axi executes the project's screencast config/scenario TypeScript (via tsx). Running it in an untrusted repository executes that repo's code (same trust model as running its build).
- `packages/screencast-axi/src/run.ts`
  SCAN-ONLY (no fs/network/process/env sinks): . Executes scenario files authored in the project (arbitrary TypeScript run in the CLI process / browser context).
- `packages/slack-axi/src/commands/setup.ts`
  Read in full. 'setup hooks' installs persistent SessionStart hooks via axi-sdk-js installSessionStartHooks (see packages/axi/axi-sdk-js hooks.ts MANUAL entry).
- `packages/slack-axi/src/commands/write.ts`
  Read in full. 'draft' stores a message locally, but 'draft send <id>' posts it to Slack AS THE USER with no human confirmation step: an agent can run draft then draft send back to back, i.e. approval is not enforced. react also writes. Mutations with 2+ workspaces require an explicit --team.
- `packages/slack-axi/src/config.ts`
  Read in full. Slack USER token (xoxp, non-expiring: manifest disables token rotation) stored as plaintext JSON at ~/.config/slack-axi/workspaces/<team>/token.json (0600 at creation; directories not restricted). SLACK_AXI_TOKEN env var also accepted. Drafts and id<->name caches stored under the same dir. Decide whether a long-lived plaintext user token is acceptable.
- `packages/slack-axi/src/slack/scopes.ts`
  Read in full. Requested user-token scopes give read access to ALL the user's conversations incl. private channels, group DMs and DMs (channels/groups/im/mpim :read and :history), workspace search:read, users:read, files:read, plus chat:write and reactions:write. Token acts as the user.

## NOTE - minor observations

- `packages/ado-axi-dtabolich/src/commands/pr.ts`
  SINK-REGIONS-READ: . Pull request list/view/create/update/complete(merge, optional squash/delete-source-branch)/vote/comment via az; 'pr complete' merges without a confirmation step.
- `packages/atl-axi/AGENTS.md`
  Read in full (shown by the harness). Upstream contributor notes for agents; benign.
- `packages/atl-axi/src/client.ts`
  Read in full. All requests go to https://api.atlassian.com/ex/jira/<cloudId> (plus one unauthenticated GET https://<site>/_edge/tenant_info for the cloud id). buildUrl() refuses to send credentials to any other origin/path. NOTE: env ATL_AXI_API_BASE can redirect the Authorization header to any https host (or http localhost); an attacker who controls your environment could use it - treat env as trusted.
- `packages/atlassian-axi/AGENTS.md`
  Read in full (shown by the harness). Upstream contributor notes; includes release-please/npm publishing procedure and a note that docs recommend 'npx -y skills@latest add emilchristensen/atlassian-axi' (an on-demand fetch). Not executed by the CLI; remove or ignore for corporate use.
- `packages/atlassian-axi/eslint.config.base.mjs`
  SCAN-ONLY (no fs/network/process/env sinks): monorepo root file (config/docs).
- `packages/atlassian-axi/eslint.config.mjs`
  SCAN-ONLY (no fs/network/process/env sinks): monorepo root file (config/docs).
- `packages/atlassian-axi/packages/confluence-axi/src/oauth.ts`
  Read in full. Atlassian 3LO flow: endpoints auth.atlassian.com / api.atlassian.com only; random state, constant-time state check, callback listener on 127.0.0.1:8765 (+::1) that ignores requests without the state; NO shipped client id (env required). Client secret + rotating tokens persisted in the plaintext 0600 config. Opens the browser via spawn(open|xdg-open|cmd /c start) with ^-escaping of cmd metacharacters.
- `packages/atlassian-axi/packages/jira-axi/src/adf.ts`
  Pattern-scanned: markdown->ADF converter; writes a temp JSON file (mkdtemp under os.tmpdir, removed afterwards) passed to acli --body-file/--description-file.
- `packages/axi/.agents/skills/axi/SKILL.md`
  Pattern-scanned. The AXI design-guidance skill for people BUILDING AXI tools; it recommends 'npx skills add <owner>/<repo>' installs and tells tool authors to write skill examples as 'npx -y mytool ...' and to ship session hooks. Only relevant when this skill is active; it is not part of any runtime tool here, but an agent following it would reintroduce npx -y. Consider deleting the vendored .agents directory (decision pending).
- `packages/axi/AGENTS.md`
  Read first 40 lines. Upstream contributor guide for the AXI repo (benchmarks, SDK, social video rendering). Benign.
- `packages/axi/CLAUDE.md`
  @AGENTS.md include.
- `packages/canva-axi/AGENTS.md`
  Read in full (shown by the harness). Documents that every mutation requires --confirm before network access; benign.
- `packages/canva-axi/src/commands/canva.ts`
  SINK-REGIONS-READ: . Mutations are gated by --confirm per the package notes.
- `packages/chrome-devtools-axi/AGENTS.md`
  Upstream CONTRIBUTOR guidance addressed to coding agents (release workflow, 'git push no-mistakes', airlock). Not relevant to using the tool and could steer an agent working in this repo toward upstream's workflow; consider deleting upstream AGENTS.md/CLAUDE.md files from vendored packages.
- `packages/chrome-devtools-axi/src/hooks.ts`
  Thin wrapper over the SDK hook installer (explicit 'setup hooks' only); see axi-sdk-js/src/hooks.ts MANUAL entry.
- `packages/chrome-devtools-axi/src/paths.ts`
  resolveOutputPath only resolves RELATIVE paths against cwd; absolute paths pass through unchecked, so output commands can write anywhere the user can (see cli.ts MANUAL).
- `packages/chrome-devtools-axi/src/sessions.ts`
  Session names validated (no path traversal); state under ~/.chrome-devtools-axi with default permissions (pid file now 0600/0700 via bridge.ts); port is derived deterministically from the session name (9224..10224), so ports are predictable.
- `packages/clockify-axi/src/rest.ts`
  Read in full. x-api-key header to https://api.clockify.me (CLOCKIFY_API_BASE / CLOCKIFY_REPORTS_API_BASE env can redirect it - trusted env). Key from CLOCKIFY_API_KEY env only. DELETE/PATCH/POST helpers exist (time entries, projects).
- `packages/cloudflare-axi/AGENTS.md`
  Read in full (shown by the harness). Upstream contributor notes; documents wrangler behaviour and live-smoke procedure against the author's account. Benign.
- `packages/cloudflare-axi/CLAUDE.md`
  '@AGENTS.md' include.
- `packages/cloudflare-axi/src/commands/pages.ts`
  SCAN-ONLY (no fs/network/process/env sinks): . pages create/deploy via wrangler (always --commit-dirty=true); publishes a local directory to the public internet.
- `packages/figma-axi/AGENTS.md`
  Read in full (shown by the harness). Upstream contributor guidance that tells agents to run 'npx -y axi-axi ...' (on-demand download of an unvetted package). Auto-loaded by Claude Code in this dir. Recommend deleting AGENTS.md/CLAUDE.md from vendored packages (decision pending).
- `packages/figma-axi/CLAUDE.md`
  '@AGENTS.md' include; see AGENTS.md note.
- `packages/figma-axi/src/figma/api.ts`
  Read in full. Calls https://api.figma.com (FIGMA_API_BASE env can redirect the token elsewhere - trusted env). downloadTo() fetches the pre-signed render URL returned by the API with NO auth header and writes it to the chosen path; URL host is not restricted (SSRF-style fetch of an API-supplied URL, token not sent).
- `packages/gh-axi/AGENTS.md`
  Read in full (shown by the harness). Upstream contributor notes (no-mistakes push gate, release-please); benign.
- `packages/gh-axi/CLAUDE.md`
  '@AGENTS.md' include.
- `packages/gh-axi/src/commands/pr.ts`
  SCAN-ONLY (no fs/network/process/env sinks): . PR create/edit/merge/review via gh; merge switches validated locally.
- `packages/gh-axi/src/commands/release.ts`
  Pattern-scanned. release create/edit/delete (delete runs 'gh release delete --yes') with no extra confirmation.
- `packages/gh-axi/src/commands/repo.ts`
  Pattern-scanned. repo create/fork with --visibility (public repos possible).
- `packages/gh-axi/src/commands/secret.ts`
  SCAN-ONLY (no fs/network/process/env sinks): . Sets/deletes repo/org/env secrets via gh with stdin values (writes to GitHub Actions secrets: can alter CI behaviour).
- `packages/gws-axi/.agents/skills/specops/SKILL.md`
  SCAN-ONLY (no fs/network/process/env sinks): Upstream specops skill/reference markdown (agent-facing). Pattern-scanned for curl/wget/npx/eval/sudo/pipes-to-shell: none; only example URLs. Benign planning-protocol text.
- `packages/gws-axi/.agents/skills/specops/references/audit-spec-drift.md`
  SCAN-ONLY (no fs/network/process/env sinks): Upstream specops skill/reference markdown (agent-facing). Pattern-scanned for curl/wget/npx/eval/sudo/pipes-to-shell: none; only example URLs. Benign planning-protocol text.
- `packages/gws-axi/.agents/skills/specops/references/plans-protocol.md`
  SCAN-ONLY (no fs/network/process/env sinks): Upstream specops skill/reference markdown (agent-facing). Pattern-scanned for curl/wget/npx/eval/sudo/pipes-to-shell: none; only example URLs. Benign planning-protocol text.
- `packages/gws-axi/.agents/skills/specops/references/spec-drift-auditor.md`
  SCAN-ONLY (no fs/network/process/env sinks): Upstream specops skill/reference markdown (agent-facing). Pattern-scanned for curl/wget/npx/eval/sudo/pipes-to-shell: none; only example URLs. Benign planning-protocol text.
- `packages/gws-axi/.agents/skills/specops/scripts/specops.mjs`
  Generated bundle (axi-sdk-js + specops CLI). Read lines 985-1050 and 1340-1568: runs 'git log'/'git rev-parse' via execFile/execSync with fixed args; 'specops hook install' writes a SessionStart hook into <repo>/.claude/settings.json or ~/.claude/settings.json (explicit, opt-in; uninstall provided). No network (no fetch/URLs found by pattern scan). Three differing copies exist (gws/metabase/slack).
- `packages/gws-axi/.claude/CLAUDE.md`
  Read in full. Upstream contributor guidance auto-loaded by Claude Code in this directory. No exfil/hidden instructions. Documents design (no gmail send, no public sharing).
- `packages/gws-axi/.claude/agents/spec-drift-auditor.md`
  Read in full. Upstream sub-agent prompt (tools: Bash, Glob, Grep, Read, WebFetch, WebSearch; model sonnet). Benign spec-audit instructions. WebFetch/WebSearch granted - consider removing the vendored .claude dir.
- `packages/gws-axi/.claude/commands/release.md`
  Upstream maintainer slash command (/release): runs gh pr list/edit/merge and npm view against the AUTHOR's repo JarvusInnovations/gws-axi. Harmless for you (needs their repo permissions) but is author-ops baggage; consider deleting the vendored .claude/commands and .claude/agents directories.
- `packages/gws-axi/src/auth/gcloud.ts`
  Read in full. execFileSync('gcloud', fixed arg arrays; no shell). Project id from user flag is passed as a positional arg (a value starting with '-' could be read as a gcloud flag; low risk, user-supplied).
- `packages/gws-axi/src/auth/loopback.ts`
  Read in full. OAuth loopback: PKCE S256, random state, 127.0.0.1-only listener on a random port, code exchange + userinfo only to Google, callback URL validated (host/port/state). Callback server also serves setup.html at /. Tokens file 0600, profile.json default umask. Prints/stores nothing outside ~/.config/gws-axi.
- `packages/gws-axi/src/auth/setup-html.ts`
  Read in full. Generates ~/.config/gws-axi/setup.html (also served on the loopback callback origin). Interpolates account email / Google profile name / --account value into HTML without escaping: minor self-XSS-class issue (needs an attacker-controlled Google display name). Links only to console.cloud.google.com and accounts.google.com.
- `packages/gws-axi/src/auth/steps.ts`
  Read in full. Guided setup. credentials.json (OAuth client secret) installed with copyFileSync, so it keeps the SOURCE file's permissions (often 0644) rather than 0600. Tighten with chmod 600 on the copy (also in 'auth join').
- `packages/gws-axi/src/commands/auth.ts`
  Read in full. auth setup/join/login/accounts/use/revoke/status/reset/publish. 'auth join' copies a shared client credentials.json (copyFileSync, perms inherited). 'auth revoke' only deletes local files and does NOT revoke the token at Google. No other egress.
- `packages/gws-axi/src/commands/gmail/draft.ts`
  Read key sections. --attach reads arbitrary local files into a Gmail DRAFT (never sent; send is deliberately unimplemented). Only egress is Gmail API; a human must press Send.
- `packages/gws-axi/src/config.ts`
  Read in full. State under ~/.config/gws-axi (XDG). setup.json/config.json/profile.json written with default umask (tokens.json and pending-auth.json are 0600). No network.
- `packages/gws-axi/src/util/paths.ts`
  Read in full. Remote-supplied filenames are sanitised (separators replaced). --out can point anywhere and existing files are overwritten silently (user/agent-directed).
- `packages/lavish-axi/AGENTS.md`
  Upstream contributor guidance addressed to coding agents (auto-loaded by Claude Code when working in this dir). Contains no exfil/hidden instructions; refers to upstream no-mistakes workflow. Consider deleting from the vendored copy.
- `packages/lavish-axi/CLAUDE.md`
  One line: '@AGENTS.md' include. Same remark as AGENTS.md.
- `packages/lavish-axi/src/html-app.js`
  Read in full. All entry points (publishToHtmlApp/updateHtmlApp/requestHtmlApp) throw HOSTED_SHARE_DISABLED (my patch) so no request to api.ht-ml.app can occur. Unreachable upstream fetch code and the ht-ml.app default URL remain in the file (dead code); consider stripping so static scanners do not flag it.
- `packages/lavish-axi/src/paths.js`
  Server bind/link host logic. Default is loopback and wildcard binds (0.0.0.0, ::) are refused. Explicit opt-ins that weaken this: LAVISH_AXI_HOST (bind a LAN/VPN address - exposes the unauthenticated editor to that network) and LAVISH_AXI_ALLOWED_HOSTS='*' (disables the DNS-rebinding Host guard). Policy suggestion: forbid both in your environment. resolveListenHosts still has Tailscale logic, but the caller no longer supplies a tailscale address (server.js patched). State dir ~/.lavish-axi is created with default permissions.
- `packages/lavish-axi/src/session-store.js`
  Read in full. Local state.json store only (fs/promises, crypto, path). No network/exec. Attachment refs re-derived from disk, tokens via crypto.randomBytes. NOTE: state.json written with default umask (not 0600) and contains artifact paths, chat transcript and DOM snapshots; keep the state dir (~/.lavish-axi) private.
- `packages/lavish-axi/src/tailscale.js`
  Runs 'tailscale status --json' via execFile (no shell). No longer invoked: auto-detection was disabled in server.js (commit: never auto-bind the Tailscale address).
- `packages/metabase-axi/.agents/skills/specops/SKILL.md`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops skill/reference markdown; no curl/npx/eval/pipe-to-shell instructions found by pattern scan.
- `packages/metabase-axi/.agents/skills/specops/references/audit-spec-drift.md`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops skill/reference markdown; no curl/npx/eval/pipe-to-shell instructions found by pattern scan.
- `packages/metabase-axi/.agents/skills/specops/references/plans-protocol.md`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops skill/reference markdown; no curl/npx/eval/pipe-to-shell instructions found by pattern scan.
- `packages/metabase-axi/.agents/skills/specops/references/spec-drift-auditor.md`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops skill/reference markdown; no curl/npx/eval/pipe-to-shell instructions found by pattern scan.
- `packages/metabase-axi/.agents/skills/specops/scripts/specops.mjs`
  SINK-REGIONS-READ: generated specops bundle (third differing build). Git via execFile/execSync fixed args; explicit opt-in hook install; no network.
- `packages/metabase-axi/CLAUDE.md`
  Read in full (shown by the harness). Upstream contributor rules (bun/asdf/specops); auto-loaded in this dir; benign.
- `packages/metabase-axi/src/metabase/client.ts`
  Read in full. Only network: fetch to the profile's configured Metabase base URL with X-API-Key or X-Metabase-Session header; 30s timeout. The base URL comes from the profile or the METABASE_URL env override, so credentials go wherever those point (trusted config).
- `packages/msgraph-axi/SKILL.md`
  SCAN-ONLY (no fs/network/process/env sinks): root-level skill text (npx wording removed earlier). Agent-facing usage docs.
- `packages/reactive-axi/packages/reactive-axi/src/proxy.js`
  Read in full. Per-session express reverse proxy bound to 127.0.0.1 (LOOPBACK_HOST) forwarding to the dev server on loopback, rewriting only text/html responses to inject the review SDK; HMR websocket passthrough.
- `packages/reactive-axi/packages/reactive-axi/src/session-store.js`
  SINK-REGIONS-READ: local state.json store like lavish-axi (default umask).
- `packages/screencast-axi/src/commands/auth.ts`
  SINK-REGIONS-READ: . 'auth login --interactive' opens a headed browser for manual sign-in and may write a storageState file.
- `packages/screencast-axi/src/toolchain.ts`
  Read in full. spawn() of ffmpeg / cwebp / gif2webp from PATH (or SCREENCAST_FFMPEG / SCREENCAST_CWEBP env paths); no network.
- `packages/slack-axi/.agents/skills/specops/README.md`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops skill/reference markdown (agent-facing). Pattern-scanned for curl/wget/npx/eval/sudo/pipe-to-shell: none.
- `packages/slack-axi/.agents/skills/specops/SKILL.md`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops skill/reference markdown (agent-facing). Pattern-scanned for curl/wget/npx/eval/sudo/pipe-to-shell: none.
- `packages/slack-axi/.agents/skills/specops/references/audit-spec-drift.md`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops skill/reference markdown (agent-facing). Pattern-scanned for curl/wget/npx/eval/sudo/pipe-to-shell: none.
- `packages/slack-axi/.agents/skills/specops/references/plans-protocol.md`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops skill/reference markdown (agent-facing). Pattern-scanned for curl/wget/npx/eval/sudo/pipe-to-shell: none.
- `packages/slack-axi/.agents/skills/specops/references/spec-drift-auditor.md`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops skill/reference markdown (agent-facing). Pattern-scanned for curl/wget/npx/eval/sudo/pipe-to-shell: none.
- `packages/slack-axi/.agents/skills/specops/scripts/build-cli.ts`
  SINK-REGIONS-READ: upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/scripts/build-skill.ts`
  SINK-REGIONS-READ: upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/scripts/specops.mjs`
  SINK-REGIONS-READ: generated specops bundle (different build from gws/metabase copies). Pattern scan: git via execFile/execSync with fixed args, explicit opt-in 'hook install' writing .claude/settings.json; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/args.ts`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/bin.ts`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/cli.ts`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/commands/common.ts`
  SINK-REGIONS-READ: upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/commands/dag.ts`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/commands/home.ts`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/commands/hook.ts`
  SINK-REGIONS-READ: upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/commands/next.ts`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/invocation.ts`
  SINK-REGIONS-READ: upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/plans.ts`
  SINK-REGIONS-READ: upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/reference.ts`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/skill.ts`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/.agents/skills/specops/src/cli/toon.ts`
  SCAN-ONLY (no fs/network/process/env sinks): upstream specops CLI TypeScript source (plans dashboard, hook installer). Same behaviour as the bundle; no network.
- `packages/slack-axi/src/commands/auth.ts`
  Read in full. 'auth login --token xoxp-...' takes the token on the command line (visible in shell history / process list); prefer SLACK_AXI_TOKEN or stdin. 'auth revoke' only deletes the local file, it does not revoke the token in Slack.
- `packages/slack-axi/src/slack/cache.ts`
  Read first 120 lines. Caches channel/user id<->name (incl. user emails when granted) under ~/.config/slack-axi/cache with default umask; message content is not cached.
