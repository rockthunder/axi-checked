# axi-vetted

Security-reviewed, patched copies of a selection of [AXI](https://github.com/kunchenguid/axi) command-line tools, prepared for use in a corporate environment.

AXI ("Agent eXperience Interface") tools are CLIs designed to be driven by AI coding agents. The upstream projects are community-maintained and were written to be convenient, which means several of them phone home, self-update from the public npm registry, write hooks into agent configuration, or fetch themselves with `npx -y` on demand. This repository keeps the useful tools and removes or neutralises those behaviours.

> **Read [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md) before rolling this out.** It states what was checked, what was changed, what was *not* checked, and which risks remain by design.

## What is in here

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

Make one tool available on a developer's machine:

```bash
cd packages/gh-axi && pnpm link --global
gh-axi --help
```

The tools call the vendor CLIs and APIs they wrap (`gh`, `aws`, `kubectl`, `psql`, Slack, Google, ...) with the developer's own credentials; install those separately.

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
