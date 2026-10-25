# axi-vetted

Security-reviewed, patched copies of a selection of [AXI](https://github.com/kunchenguid/axi) command-line tools, prepared for use in a corporate environment.

AXI ("Agent eXperience Interface") tools are CLIs designed to be driven by AI coding agents. The upstream projects are community-maintained and were written to be convenient, which means several of them phone home, self-update from the public npm registry, write hooks into agent configuration, or fetch themselves with `npx -y` on demand. This repository keeps the useful tools and removes or neutralises those behaviours.

> **Read [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md) before rolling this out.** It states what was checked, what was changed, what was *not* checked, and which risks remain by design.

## Important notice: please do your own checks

**What was done.** The upstream projects were copied at pinned commits and examined with the help of an AI assistant (Claude) at the repository owner's request. The work covered: pattern scans of every file; reading the security-relevant code (credentials, network calls, process execution, local servers); removing telemetry, self-update and on-demand downloads; patching weak safety guards; locking one dependency tree and scanning it against the public OSV.dev vulnerability database; and running the test suites on Linux. Every change is a separate git commit with its reason, and everything that still needs a human decision is listed in [`review/MANUAL-REVIEW.md`](review/MANUAL-REVIEW.md).

**What this is not.** It is not a certification, a guarantee, or an independent professional security audit. Roughly half of the code (about 330 of 490 files) was checked by pattern search only, not read line by line; no tool was run under network monitoring; native binaries pulled in by dependencies were not analysed; and an AI-assisted review can miss things or be wrong. New vulnerabilities and new upstream releases appear after the review date (2026-10-24).

**Please verify for yourself before you rely on it.** Read the diffs against the `import(pristine)` commits for the tools you intend to use, review [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md) and the manual-review list, test in a sandbox with network capture, give each tool only least-privilege credentials, and have your own security, legal and compliance teams approve it for your environment. Re-run the vulnerability scan (`pnpm run audit:osv`) before each rollout.

**No warranty and no liability.** This repository is provided "as is", without warranty of any kind, express or implied, including merchantability, fitness for a particular purpose, security, or non-infringement. The maintainer of this repository and the people who contributed to the review accept no responsibility or liability for any loss, damage, data exposure, outage, cost or other consequence arising from downloading, installing, modifying or using this code or from relying on any statement in this repository, to the fullest extent permitted by law. You use it at your own risk and are responsible for deciding whether it is suitable for your environment. (This notice is a plain-language statement, not legal advice; ask your own counsel if you need one tailored to your organisation.)

**Not affiliated with the original authors.** The tools are the work of their original authors (see [`SOURCES.md`](SOURCES.md)), who have not reviewed, endorsed or supported this fork and are not responsible for its changes. Do not report problems with this build to them; their support channels apply only to the unmodified upstream releases. Each package keeps its upstream licence (all MIT), and the MIT licence's own disclaimer of warranty applies to this repository as well.

## What is in here

- [`GETTING-STARTED.md`](GETTING-STARTED.md) - what AXI is, prerequisites, tokens, install steps and agent prompts.
- [`SOURCES.md`](SOURCES.md) - every package, its upstream repository, the exact reviewed commit, and links back to the original README.
- `packages/<name>/` - the code. Each package contains an `UPSTREAM.txt` and its README starts with a banner linking to the original.
- 21 CLIs and the shared `axi-sdk-js` library, from 21 upstream repositories (`confluence-axi` is included because it lives in the same upstream repo as `jira-axi`), plus a list of projects that were reviewed but **not** vendored or deliberately **excluded** (with reasons).

## How the history is organised

The git history is the review trail:

1. `import(pristine): <name> @ <sha>` - one commit per upstream project, byte-for-byte what upstream had at the reviewed commit (minus its CI config and a few non-runtime directories listed in each `UPSTREAM.txt`).
2. Every later commit is a deliberate change with its reason in the message.

To see everything that was changed in one tool compared to upstream:

```bash
git log --oneline -- packages/lavish-axi
git diff $(git log --format=%h --grep='import(pristine): lavish-axi' -1) HEAD -- packages/lavish-axi
```

## Build and use

Requirements: Node.js 22+, pnpm 12, and TLS access to `registry.npmjs.org` (if your network intercepts TLS, set `NODE_EXTRA_CA_CERTS` to your corporate root CA; do not disable certificate checks).

```bash
pnpm install --frozen-lockfile      # lifecycle scripts are disabled by .npmrc
pnpm build                          # explicit build; nothing builds on install
```

Make one tool available on a developer's machine (run `pnpm setup` once and open a new terminal first so the pnpm global bin folder is on PATH; `pnpm link --global` no longer works in pnpm 12):

```bash
pnpm add -g ./packages/gh-axi
gh-axi --help
```

Step-by-step install, the credentials each tool needs, and ready-to-paste agent prompts (one for everything, one per tool) are in [`GETTING-STARTED.md`](GETTING-STARTED.md).

The tools call the vendor CLIs and APIs they wrap (`gh`, `aws`, `kubectl`, `psql`, Slack, Jira, ...) with the developer's own credentials; install those separately.

Agent hooks (`<tool> setup hooks`) are opt-in. Nothing in this repo installs them automatically.

## Supply-chain controls

- One workspace, one lockfile, `ignore-scripts=true`; only `esbuild` may run a dependency build script.
- `minimumReleaseAge` 7 days (strict) and `trustPolicy: no-downgrade`. The few exceptions are listed with reasons in [`pnpm-workspace.yaml`](pnpm-workspace.yaml).
- pnpm reports "agent skills awaiting approval" for some dependencies (e.g. `chrome-devtools-mcp`, `ultracite`). They are deliberately **not** approved.
- Re-scan for known vulnerabilities at any time (queries the public OSV.dev database): `pnpm run audit:osv`.
- Run all package tests on Linux in a container: see [`scripts/test-linux.sh`](scripts/test-linux.sh).

## Licensing

Each package keeps its upstream `LICENSE` (all MIT). The original authors retain their copyrights; modifications in this repository are offered under the same terms. Projects with no license upstream are **not** included (see `SOURCES.md`).

## Updating from upstream

Do not bump versions casually. To take a new upstream release: fetch it into a scratch directory, diff it against the `import(pristine)` commit for that package, re-run the review on the diff (network calls, process execution, credential access, install scripts, new dependencies), then re-apply or drop each local patch. Re-run `pnpm run audit:osv` and the Linux test script before merging.
