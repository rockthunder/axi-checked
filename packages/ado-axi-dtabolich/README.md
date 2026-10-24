> **Vetted copy** of [dtabolich/ado-axi](https://github.com/dtabolich/ado-axi) at commit `8c96e95`. This README is the upstream text; behaviour differs where this repo patched it - see [`SECURITY-REVIEW.md`](../../SECURITY-REVIEW.md) and [`SOURCES.md`](../../SOURCES.md). Original: [dtabolich/ado-axi README](https://github.com/dtabolich/ado-axi/blob/8c96e95d41d6bbe839c583c7cc18c4453d40b46e/README.md).

# ado-axi

Azure DevOps CLI for agents — designed with [AXI](https://axi.md) (Agent eXperience Interface).

Wraps Azure CLI (`az` + `azure-devops`) with token-efficient [TOON](https://toonformat.dev/) output, contextual next-step suggestions, and structured errors. Focused on **repo / PR / CI** workflows agents actually drive from the shell.

## Quick start

```sh
# prerequisites
az extension add --name azure-devops
az login
# optional defaults:
# az devops configure -d organization=https://dev.azure.com/<org> project=<project>

npm install -g ado-axi
ado-axi                  # dashboard for current git remote
ado-axi pr list --status active
```

Or install the agent skill (recommended for agents):

```sh
npx skills add dtabolich/ado-axi --skill ado-axi -g
```

The skill teaches agents to run `npx -y ado-axi` on demand.

## Targeting

| Field | Priority |
| --- | --- |
| org | `--org` → `AZURE_DEVOPS_ORG` → git remote → `az devops configure` |
| project | `--project`/`-p` → `AZURE_DEVOPS_PROJECT` → git remote → `az devops configure` |
| repo | `-R`/`--repo` → `AZURE_DEVOPS_REPO` → git remote |

For the no-args home dashboard without a git remote, set `AZURE_DEVOPS_REPO` (org/project can come from `az devops configure`).

Supported remotes:

- `https://dev.azure.com/{org}/{project}/_git/{repo}`
- `git@ssh.dev.azure.com:v3/{org}/{project}/{repo}`
- `https://{org}.visualstudio.com/...`

Non-ADO remotes resolve to no target (no guessing).

## Commands

| Command | Description |
| --- | --- |
| `(none)` | Home dashboard — active PRs for the current repo |
| `pr` | list, view, create, update, complete, set-vote, reviewers, checks, diff, comment |
| `repo` | list, show |
| `ref` | list, create, delete |
| `run` | list, view, log, watch |
| `api` | raw `az devops invoke` passthrough |
| `auth status` | login / defaults (never prints secrets) |
| `setup hooks` | SessionStart hooks for Claude Code, Codex, OpenCode |

## Examples

```sh
ado-axi pr list --status active
ado-axi pr view 42 --full
ado-axi pr create --title "Fix auth" --source-branch feature/x --target-branch main
ado-axi pr complete 42 --squash
ado-axi ref list --filter heads
ado-axi ref create --name feature/y --from main
ado-axi run list --branch main
ado-axi run watch 12345
ado-axi api --area git --resource repositories --route project=MyProject
ado-axi setup hooks
```

## Development

```sh
npm install
npm test
npm run build
npm run dev -- pr list --status active
```

## Catalog

See [AXI_CATALOG_ENTRY.md](./AXI_CATALOG_ENTRY.md) for the community catalog snippet.

## License

MIT
