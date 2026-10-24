# AXI Catalog Entry

Use this entry when contributing `elasticsearch-axi` to the `kunchenguid/axi`
community catalog so it appears on axi.md.

| AXI | Author | Domain | Description |
| --- | --- | --- | --- |
| [`elasticsearch-axi`](https://github.com/thatdudealso/elasticsearch-axi) | thatdudealso | Elasticsearch | Discover, inspect, query, index, map, snapshot, restore, diagnose, and operate Elasticsearch clusters through safe token-efficient CLI workflows. |

## Upstream Checklist

```sh
git -C /Users/thatdudealso/axi fetch origin
git -C /Users/thatdudealso/axi switch -C docs/add-elasticsearch-axi-catalog-entry origin/main
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm --dir packages/axi-sdk-js run build
pnpm --dir packages/axi-sdk-js test
no-mistakes init --fork-url git@github.com:thatdudealso/axi.git
git push no-mistakes
```

Commit message:

```sh
docs: add elasticsearch-axi to community catalog
```
