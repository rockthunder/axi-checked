# AXI Catalog Entry

Use this entry when contributing `kubernetes-axi` to the `kunchenguid/axi`
community catalog so it appears on axi.md.

| AXI | Author | Domain | Description |
| --- | --- | --- | --- |
| [`kubernetes-axi`](https://github.com/thatdudealso/kubernetes-axi) | thatdudealso | Kubernetes | Discover, inspect, deploy, debug, scale, roll out, expose, and clean up Kubernetes workloads through safe token-efficient CLI workflows. |

## Upstream Checklist

```sh
git -C /Users/thatdudealso/axi fetch origin
git -C /Users/thatdudealso/axi switch -C docs/add-kubernetes-axi-catalog-entry origin/main
pnpm install --frozen-lockfile
pnpm run docs:gen
pnpm run format:check
pnpm run lint
pnpm --dir packages/axi-sdk-js run build
pnpm --dir packages/axi-sdk-js test
no-mistakes init --fork-url https://github.com/thatdudealso/axi.git
git push no-mistakes
```

Commit message:

```sh
docs: add kubernetes-axi to community catalog
```
