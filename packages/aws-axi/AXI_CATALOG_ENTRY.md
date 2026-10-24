# AXI Catalog Entry

Use this entry when contributing `aws-axi` to the `kunchenguid/axi` community
catalog so it appears on axi.md.

| AXI | Author | Domain | Description |
| --- | --- | --- | --- |
| [`aws-axi`](https://github.com/thatdudealso/aws-axi) | thatdudealso | AWS | Discover, plan, provision, deploy, and inspect AWS services for hosting web, backend, database, and AI workloads through safe token-efficient CLI workflows. |

## Upstream Checklist

```sh
no-mistakes init --fork-url git@github.com:thatdudealso/axi.git
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm --dir packages/axi-sdk-js run build
pnpm --dir packages/axi-sdk-js test
git push no-mistakes
```

Commit message:

```sh
docs: add aws-axi to community catalog
```
