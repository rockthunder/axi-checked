# elasticsearch-axi

Agent-facing Elasticsearch/OpenSearch operations AXI for discovering,
inspecting, querying, indexing, mapping, snapshotting, restoring, diagnosing,
and safely operating clusters through a non-interactive, token-efficient CLI.

The project follows the AXI creation guidelines installed with
`npx skills add kunchenguid/axi`.

## Goals

- Show useful live cluster context with `elasticsearch-axi`, not help text.
- Use compact TOON-style stdout for agent parsing.
- Keep every command non-interactive.
- Fail loudly on unknown flags before side effects.
- Default to read-only discovery, inspection, and dry-run behavior.
- Require `--execute` for mutations.
- Require `--confirm <name>` for destructive operations.
- Truncate long query results, mappings, settings, and task descriptions by default.
- Redact credentials, API keys, bearer tokens, basic-auth URLs, and secret-like document fields.

## Usage

```sh
npm test
./bin/elasticsearch-axi.js
./bin/elasticsearch-axi.js doctor
./bin/elasticsearch-axi.js services
./bin/elasticsearch-axi.js discover
./bin/elasticsearch-axi.js recommend --goal inspect
./bin/elasticsearch-axi.js list --kind indices
./bin/elasticsearch-axi.js inspect --kind index --name my-index
./bin/elasticsearch-axi.js query --index my-index --body '{"query":{"match_all":{}}}'
./bin/elasticsearch-axi.js sql --query "SELECT * FROM my-index LIMIT 10"
./bin/elasticsearch-axi.js create --kind index --name my-index --body mapping.json --execute
```

Mutating operations are dry-run by default. Add `--execute` only after
reviewing the generated request. Destructive operations also require
`--confirm <exact-name>`. Read-only search (`query`, `sql`) runs immediately
since it never mutates cluster state.

## Connecting

| flag | env var | description |
| --- | --- | --- |
| `--url` | `ELASTICSEARCH_URL` / `ES_URL` | Cluster endpoint URL (default `http://localhost:9200`) |
| `--cloud-id` | `ELASTIC_CLOUD_ID` | Elastic Cloud ID, decoded into an endpoint |
| `--api-key` | `ELASTIC_API_KEY` / `ES_API_KEY` | Sent as `Authorization: ApiKey <value>` |
| `--user` / `--password` | `ELASTIC_USERNAME` / `ELASTIC_PASSWORD` | Sent as `Authorization: Basic <base64>` |
| `--insecure` | — | Skip TLS certificate verification (never default) |

API keys take precedence over basic auth when both resolve. An explicit
`--url` always wins over a cloud-id-derived endpoint.

## Elasticsearch Domains

- Connection: endpoint URLs, cloud IDs, API keys, basic auth, TLS, env vars
- Cluster health: status, version, nodes, shards, allocation, disk watermarks
- Indices: create, list, inspect, mappings, settings, aliases
- Search/query: Query DSL, SQL API, capped results
- Documents: index, bulk, reindex, guarded writes
- Templates: index templates, component templates
- Pipelines: ingest pipelines and processors
- Lifecycle: ILM policies, old-index cleanup planning
- Snapshots: repositories, snapshots, restores
- Security: users, roles, auth-error translation, secret redaction
- Operations: tasks, recovery, segments, thread pools
- Local dev: Docker Compose Elasticsearch/OpenSearch services
- Managed/cloud: Elastic Cloud, AWS OpenSearch, self-hosted OpenSearch detection

## Custom Targets

`elasticsearch-axi.config.json` can declare explicit connection targets so
`discover`/`home` surface them ahead of filesystem-detected ones:

```json
{
  "targets": [
    { "name": "staging", "url": "https://staging-es.internal:9200" }
  ]
}
```

## Hooks and Skill

Install ambient session context hooks after explicit opt-in:

```sh
elasticsearch-axi hooks install --agent all --scope project --execute
```

Generate or verify installable skill guidance:

```sh
elasticsearch-axi skill generate
elasticsearch-axi skill generate --check
```

## Testing

```sh
npm test                                        # fake curl, no live cluster needed
ELASTICSEARCH_AXI_LIVE_TESTS=1 npm run test:live # requires a real reachable cluster
```

## AXI Catalog Entry

The upstream `kunchenguid/axi` community catalog entry should be:

- AXI: `elasticsearch-axi`
- Author: `thatdudealso`
- Domain: `Elasticsearch`
- Description: `Discover, inspect, query, index, map, snapshot, restore, diagnose, and operate Elasticsearch clusters through safe token-efficient CLI workflows.`
- Link: `https://github.com/thatdudealso/elasticsearch-axi`

## License

MIT
