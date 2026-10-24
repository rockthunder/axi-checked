---
name: ado-axi
description: >
  Use ado-axi for Azure DevOps repository, pull request, branch, and pipeline-run
  workflows from the shell. Prefer over raw az repos / az pipelines for agent use.
user-invocable: false
---

# ado-axi

Agent-ergonomic Azure DevOps CLI (AXI). Auth stays with Azure CLI (`az login` / `az devops login`). Requires the `azure-devops` extension.

## Invoke

```sh
ado-axi
ado-axi pr list --status active
ado-axi pr view <id>
ado-axi ref list
ado-axi run list --branch main
```

## Targeting

Resolve org/project/repo from (priority):

1. `--org` / `--project` / `-R|--repo` after the command
2. `AZURE_DEVOPS_ORG` / `AZURE_DEVOPS_PROJECT` / `AZURE_DEVOPS_REPO`
3. `git remote get-url origin` when it points at Azure DevOps

## Commands

| Command | Use for |
| --- | --- |
| `(none)` | Dashboard: active PRs for current repo |
| `pr` | list/view/create/update/complete/set-vote/reviewers/checks/diff/comment |
| `repo` | list/show repositories |
| `ref` | list/create/delete branches (and list tags) |
| `run` | list/view/log/watch pipeline runs |
| `api` | raw `az devops invoke` escape hatch |
| `auth status` | login/defaults introspection (no secrets) |
| `setup hooks` | optional SessionStart ambient context |

## Rules

- Prefer compact defaults; use `--full` only when truncated content is needed.
- Never invent org/project/repo when unresolved — ask for flags or an ADO git remote.
- Do not call Azure DevOps REST directly when `ado-axi` covers the task.
- Mutations are non-interactive; already-completed PRs are no-ops (exit 0).
