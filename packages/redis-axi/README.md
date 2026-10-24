> **Vetted copy** of [thatdudealso/redis-axi](https://github.com/thatdudealso/redis-axi) at commit `f6cd8ad`. This README is the upstream text; behaviour differs where this repo patched it - see [`SECURITY-REVIEW.md`](../../SECURITY-REVIEW.md) and [`SOURCES.md`](../../SOURCES.md). Original: [thatdudealso/redis-axi README](https://github.com/thatdudealso/redis-axi/blob/f6cd8ad24eff88f0bdd570b0bcfc6782f13499dd/README.md).

# redis-axi

Agent-facing Redis AXI for safe token-efficient CLI workflows.

Discover, inspect, query, export, import, maintain, and diagnose Redis databases through compact TOON-style output designed for AI agents and developer scripts.

## Install

```sh
npm install -g redis-axi
# or run without installing
npx -y redis-axi
```

## Quick start

```sh
redis-axi                          # live dashboard: version, mode, keys, clients
redis-axi doctor                   # check redis-cli, connection, TLS, auth, persistence
redis-axi discover                 # detect Redis targets in this workspace
redis-axi list --kind keys --pattern 'session:*' --limit 20
redis-axi inspect --kind key --name mykey
redis-axi query --command "HGETALL user:1"
redis-axi create --kind string --name cache:key --value hello --execute
redis-axi drop --kind key --name cache:key --confirm cache:key --execute
redis-axi maintenance --action bgsave --execute
redis-axi activity
redis-axi stats --kind memory
```

## Commands

| Command | Description |
| --- | --- |
| `redis-axi` | Live dashboard |
| `redis-axi doctor` | Check Redis readiness |
| `redis-axi services` | List capability domains |
| `redis-axi discover` | Detect Redis targets |
| `redis-axi recommend --goal <goal>` | Suggest workflow paths |
| `redis-axi list --kind <kind>` | List keys, streams, clients, users, channels, and more |
| `redis-axi inspect --kind <kind> --name <name>` | Inspect server, key, stream, group, user, cluster, sentinel |
| `redis-axi query --key <key>\|--command <cmd>\|--file <path>` | Read keys or run commands |
| `redis-axi create --kind <kind> --name <name>` | Create keys, hashes, streams, users, groups |
| `redis-axi drop --kind <kind> --name <name> --confirm <name>` | Drop with destructive guard |
| `redis-axi export --file <path>` | Plan or run RDB/RESP export |
| `redis-axi import --file <path> --confirm <db>` | Plan or run RESP/JSON import |
| `redis-axi maintenance --action <action>` | BGSAVE, MEMORY PURGE, SLOWLOG RESET, FLUSHDB, and more |
| `redis-axi activity` | Clients, slowlog, latency summary |
| `redis-axi stats --kind <kind>` | INFO sections: memory, keyspace, clients, commands, replication |
| `redis-axi kill --client-id <id> --confirm <id>` | Kill a client connection |
| `redis-axi hooks install` | Install session context hooks |
| `redis-axi skill generate` | Generate installable Agent Skill |

## Safety

- **No `KEYS` command** — uses `SCAN` for all key discovery
- **No blocking commands** — `SUBSCRIBE`, `BLPOP`, `XREAD BLOCK`, `MONITOR` are blocked by default
- **Mutations require `--execute`** — all writes are dry-run by default
- **Destructive operations require `--execute` + `--confirm <exact-value>`**
- **Output truncated by default** — add `--full` for complete output
- **Credentials always redacted** — Redis URLs, passwords, tokens, TLS keys, and secret-like fields are never printed

## Connection

```sh
# Environment variables
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secret
REDIS_DB=0

# Flags
redis-axi --url redis://localhost:6379
redis-axi --host localhost --port 6379 --password secret
redis-axi --tls --tls-cert client.crt --tls-key client.key --tls-ca ca.crt

# TLS via URL scheme
redis-axi --url rediss://localhost:6380
```

## Managed Redis

`redis-axi discover` detects:
- **Upstash** — `UPSTASH_REDIS_REST_URL` env vars
- **Redis Cloud** — `redislabs` config hints
- **AWS ElastiCache** — `.cache.amazonaws.com` endpoint hints
- **Azure Cache for Redis** — `cache.windows.net` hints
- **GCP Memorystore** — `redis.googleapis.com` hints
- Custom targets via `redis-axi.config.json`

## License

MIT
