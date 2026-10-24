# AXI Catalog Entry

Use this entry when contributing `ado-axi` to the `kunchenguid/axi` community
catalog so it appears on axi.md.

```yaml
- name: ado-axi
  url: https://github.com/dtabolich/ado-axi
  author: dtabolich
  domain: Azure DevOps
  description: "Pull requests, branches, repositories, and pipeline runs. Wraps Azure CLI (`az devops` / `az repos`) with agent-ergonomic TOON output."
```

## Upstream checklist

```sh
no-mistakes init --fork-url git@github.com:<you>/axi.git
# edit catalog.yaml, then:
pnpm run docs:gen
git push no-mistakes
```

Commit message:

```text
docs: add ado-axi to community catalog
```
