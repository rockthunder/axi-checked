# Items for a human to review

Generated from `review/log.tsv` by `python -I scripts/review-status.py render-manual`. **MANUAL** = high risk or unsure: please look yourself. **NOTE** = minor, benign-but-worth-knowing.

## MANUAL - needs your review

- `packages/aws-axi/bin/aws-axi.js`
  Wrapper over aws/sam/cdk/terraform via spawnSync (no shell). TRUST BOUNDARY: 'plan' is described as non-mutating but runs argv arrays taken from <cwd>/aws-axi.config.json (targets[].commands.plan / .deploy), so running 'aws-axi plan' (no --execute) in an untrusted repo executes whatever programs that repo's config names; 'terraform plan' also executes repo terraform (external data sources/providers). 'apply --execute' uses non-interactive flags (terraform -auto-approve, cdk --require-approval never, sam --no-confirm-changeset); production needs --confirm-account. Full process.env passed to children; findExecutable() treats an empty PATH entry as cwd. sanitize() redaction is regex-only. Hook install writes unquoted 'node <path>' commands. Suggested hardening: only honour custom commands when --execute is given, or only from a trusted config path. Skill text had 'npx -y aws-axi' (fixed in commit 'remove remaining npx').
- `packages/axi/packages/axi-sdk-js/src/hooks.ts`
  Explicit opt-in (setup hooks) but powerful and persistent: writes SessionStart hooks into ~/.claude/settings.json, ~/.codex/hooks.json (or project .claude/.codex), an OpenCode plugin, and ENABLES the global [features] hooks=true flag in ~/.codex/config.toml. Hook command is an unquoted exec path or a bare binary name resolved through PATH at every agent session start (PATH-hijack / spaces-in-path risk); command-substring match (includes(marker)) can overwrite an unrelated hook that merely mentions the tool name. No network. Decide whether your org allows 'setup hooks' at all (or remove the call from each tool's setup command).
- `packages/kubernetes-axi/bin/kubernetes-axi.js`
  Read in full. FIXED: (1) 'config view' used 'kubectl config view --raw' (real credentials then regex-redacted) -> no --raw; (2) 'inspect --kind secret' used regex redaction of YAML (last-applied-configuration annotation repeats the secret) -> key names only. NEEDS YOUR DECISION: (a) TRUST BOUNDARY as in aws-axi: 'plan' (no --execute) runs argv taken from <cwd>/kubernetes-axi.config.json (targets[].commands.plan) and 'helm template'/'kubectl kustomize' on repo content, so running it in an untrusted repo executes repo-chosen programs; (b) 'apply/delete/scale/exec --execute' act on whatever kube CONTEXT is current with no production/context confirmation (aws-axi at least requires --confirm-account for production); (c) 'clean --kind pods|jobs --execute' deletes ALL pods/jobs in the namespace with no --confirm; (d) 'exec --execute' can read anything inside a pod (service-account tokens, env) - output is only pattern-redacted. Other: full process.env passed to kubectl/helm; hooks install writes unquoted 'node <path>'; script has an sh/node polyglot shebang (benign).

## NOTE - minor observations

_(none)_

