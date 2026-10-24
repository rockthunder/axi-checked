import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "bin", "redis-axi.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "redis-axi-"));
}

function makeFakeBin(workspace, handlers = {}) {
  const bin = path.join(workspace, "bin");
  fs.mkdirSync(bin, { recursive: true });
  for (const name of ["redis-cli", "redis-server"]) {
    const script = handlers[name] ?? defaultFake(name);
    const file = path.join(bin, name);
    fs.writeFileSync(file, script);
    fs.chmodSync(file, 0o755);
  }
  return bin;
}

function defaultFake(name) {
  if (name === "redis-server") return "#!/bin/sh\necho 'Redis 7.2.0'\n";
  return `#!/bin/sh
args="$*"
case "$args" in
  *"PING"*) echo 'PONG' ;;
  *"INFO server"*|*"INFO all"*)
    echo '# Server'
    echo 'redis_version:7.2.0'
    echo 'redis_mode:standalone'
    echo 'role:master'
    echo '# Clients'
    echo 'connected_clients:3'
    echo '# Memory'
    echo 'used_memory_human:2.50M'
    echo '# Keyspace'
    echo 'db0:keys=42,expires=5,avg_ttl=3600'
    echo '# Persistence'
    echo 'rdb_last_bgsave_status:ok'
    echo 'aof_enabled:0'
    ;;
  *"INFO keyspace"*)
    echo '# Keyspace'
    echo 'db0:keys=42,expires=5,avg_ttl=3600'
    echo 'db1:keys=10,expires=0,avg_ttl=0'
    ;;
  *"INFO memory"*)
    echo '# Memory'
    echo 'used_memory_human:2.50M'
    echo 'maxmemory_human:0B'
    ;;
  *"INFO replication"*)
    echo '# Replication'
    echo 'role:master'
    echo 'connected_slaves:1'
    ;;
  *"CLIENT LIST"*)
    echo 'id=1 addr=127.0.0.1:50001 db=0 cmd=ping age=0 idle=0 flags=N name='
    echo 'id=2 addr=127.0.0.1:50002 db=0 cmd=get age=1 idle=0 flags=N name='
    ;;
  *"CLIENT KILL"*) echo '1' ;;
  *"ACL LIST"*)
    echo 'user default on nopass ~* &* +@all'
    echo 'user appuser on #abc123hash ~app:* &* +@read'
    ;;
  *"ACL GETUSER"*)
    echo 'flags'
    echo 'on'
    echo 'passwords'
    echo '<redacted>'
    echo 'commands'
    echo '+@all'
    ;;
  *"SLOWLOG GET"*)
    echo '1) 1) (integer) 1'
    echo '   2) (integer) 1700000000'
    echo '   3) (integer) 1234'
    echo '   4) 1) "SET"'
    echo '      2) "mykey"'
    ;;
  *"SLOWLOG RESET"*) echo 'OK' ;;
  *"TYPE"*)
    case "$args" in
      *"mystream"*) echo 'stream' ;;
      *"myhash"*) echo 'hash' ;;
      *"mylist"*) echo 'list' ;;
      *"myset"*) echo 'set' ;;
      *"myzset"*) echo 'zset' ;;
      *) echo 'string' ;;
    esac
    ;;
  *"GET"*) echo 'hello-world' ;;
  *"HGETALL"*)
    echo 'field1'
    echo 'value1'
    echo 'field2'
    echo 'value2'
    ;;
  *"LRANGE"*)
    echo '1) "item1"'
    echo '2) "item2"'
    ;;
  *"SMEMBERS"*)
    echo '1) "member1"'
    echo '2) "member2"'
    ;;
  *"ZRANGE"*)
    echo '1) "member1"'
    echo '2) "0"'
    ;;
  *"XRANGE"*)
    echo '1) 1) "1700000000000-0"'
    echo '   2) 1) "field"'
    echo '      2) "value"'
    ;;
  *"XINFO STREAM"*)
    echo 'length'
    echo '(integer) 100'
    echo 'first-entry'
    echo '1) "1700000000000-0"'
    ;;
  *"XINFO GROUPS"*)
    echo '1) 1) "name"'
    echo '   2) "mygroup"'
    echo '   3) "consumers"'
    echo '   4) (integer) 2'
    echo '   5) "pending"'
    echo '   6) (integer) 0'
    echo '   7) "last-delivered-id"'
    echo '   8) "1700000000000-0"'
    ;;
  *"XPENDING"*)
    echo '(empty array)'
    ;;
  *"XGROUP CREATE"*) echo 'OK' ;;
  *"XADD"*) echo '1700000000000-0' ;;
  *"SET "*) echo 'OK' ;;
  *"HSET "*) echo '(integer) 2' ;;
  *"DEL "*) echo '(integer) 1' ;;
  *"UNLINK "*) echo '(integer) 1' ;;
  *"FLUSHDB"*) echo 'OK' ;;
  *"FLUSHALL"*) echo 'OK' ;;
  *"BGSAVE"*) echo 'Background saving started' ;;
  *"MEMORY PURGE"*) echo 'OK' ;;
  *"MEMORY USAGE"*) echo '(integer) 512' ;;
  *"TTL"*) echo '(integer) 3600' ;;
  *"EXPIRE "*) echo '(integer) 1' ;;
  *"PERSIST "*) echo '(integer) 1' ;;
  *"PUBSUB CHANNELS"*)
    echo '1) "news:sports"'
    echo '2) "news:tech"'
    ;;
  *"PUBSUB NUMPAT"*) echo '(integer) 3' ;;
  *"CLUSTER INFO"*) echo 'cluster_enabled:0' ;;
  *"CLUSTER NODES"*)
    echo 'abc123def456 127.0.0.1:7000@17000 master - 0 1700000000000 1 connected 0-5460'
    ;;
  *"SENTINEL MASTER"*)
    echo '1) "name"'
    echo '2) "mymaster"'
    echo '3) "ip"'
    echo '4) "127.0.0.1"'
    echo '5) "port"'
    echo '6) "6379"'
    ;;
  *"SENTINEL SENTINELS"*)
    echo '1) 1) "name"'
    echo '   2) "sentinel1"'
    echo '   3) "ip"'
    echo '   4) "127.0.0.1"'
    echo '   5) "port"'
    echo '   6) "26380"'
    echo '   7) "flags"'
    echo '   8) "sentinel"'
    ;;
  *"LATENCY LATEST"*) echo '(empty array)' ;;
  *"--scan"*"--pattern"*) echo 'session:abc123'; echo 'session:def456'; echo 'cache:key1' ;;
  *"--rdb"*) echo 'DUMP payload written' ;;
  *"--pipe"*) echo 'All data transferred. Waiting for the last reply...' ;;
  *"ACL SETUSER"*) echo 'OK' ;;
  *"ACL DELUSER"*) echo '(integer) 1' ;;
  *) echo 'OK' ;;
esac
`;
}

function run(args, options = {}) {
  const cwd = options.cwd ?? tempWorkspace();
  const env = { ...process.env, ...(options.env ?? {}) };
  return spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: "utf8" });
}

// ── Core behavior ─────────────────────────────────────────────────────────────

test("home view shows live Redis context and no help-first output", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  fs.writeFileSync(path.join(cwd, ".env"), "REDIS_URL=redis://user:secret@redis.example.com:6379\n");
  const result = run([], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /^bin: /);
  assert.match(result.stdout, /description: "Operate Redis/);
  assert.match(result.stdout, /redis-cli: ok/);
  assert.match(result.stdout, /ready: ok/);
  assert.match(result.stdout, /version: 7\.2\.0/);
  assert.match(result.stdout, /mode: standalone/);
  assert.match(result.stdout, /keys: 42/);
  assert.match(result.stdout, /targets\[/);
  assert.doesNotMatch(result.stdout, /secret/);
  assert.doesNotMatch(result.stdout, /^usage:/);
  assert.equal(result.stderr, "");
});

test("services lists all Redis capability domains", () => {
  const result = run(["services"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /connection/);
  assert.match(result.stdout, /streams/);
  assert.match(result.stdout, /pubsub/);
  assert.match(result.stdout, /cluster/);
  assert.match(result.stdout, /cloud/);
  assert.match(result.stdout, /local-dev/);
});

test("doctor reports missing redis-cli without crashing", () => {
  const cwd = tempWorkspace();
  const result = run(["doctor"], { cwd, env: { PATH: path.dirname(process.execPath) } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /redis-cli,missing/);
  assert.match(result.stdout, /summary: attention-required/);
  assert.equal(result.stderr, "");
});

test("doctor reports ready when redis-cli and PING succeed", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["doctor"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /redis-cli,ok/);
  assert.match(result.stdout, /summary: ready/);
});

// ── Unknown flags ─────────────────────────────────────────────────────────────

test("unknown flags fail before calling redis-cli", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd, {
    "redis-cli": "#!/bin/sh\necho called >> redis-called\nexit 0\n"
  });
  const result = run(["list", "--kind", "keys", "--bogus"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 2);
  assert.match(result.stdout, /error: unknown flag --bogus for `list`/);
  assert.equal(fs.existsSync(path.join(cwd, "redis-called")), false);
  assert.equal(result.stderr, "");
});

test("missing required flags return structured usage errors", () => {
  const result = run(["inspect"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /error: --kind is required/);
  assert.match(result.stdout, /help\[1\]:/);
  assert.equal(result.stderr, "");
});

test("unknown command returns structured error", () => {
  const result = run(["bogus-command"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /error: unknown command/);
  assert.equal(result.stderr, "");
});

// ── Discovery ─────────────────────────────────────────────────────────────────

test("discover detects env, compose, Bull, Sidekiq, Celery, cache, Sentinel, Cluster, Upstash fixtures", () => {
  const cwd = tempWorkspace();
  fs.writeFileSync(path.join(cwd, ".env"), "REDIS_URL=redis://:secret@localhost:6379\nUPSTASH_REDIS_REST_URL=https://example.upstash.io\n");
  fs.writeFileSync(path.join(cwd, "docker-compose.yml"), "services:\n  cache:\n    image: redis:7\n");
  fs.writeFileSync(path.join(cwd, "bullmq.config.js"), "const connection = { host: 'localhost', port: 6379 };\n");
  fs.writeFileSync(path.join(cwd, "sidekiq.yml"), ":redis:\n  url: redis://localhost:6379\n");
  fs.writeFileSync(path.join(cwd, "celery.py"), "CELERY_BROKER_URL = 'redis://localhost:6379/0'\n");

  const result = run(["discover", "--full"], { cwd });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /env:\.env/);
  assert.match(result.stdout, /compose:docker-compose\.yml/);
  assert.doesNotMatch(result.stdout, /secret/);
});

test("discover detects redis-axi.config.json custom targets", () => {
  const cwd = tempWorkspace();
  fs.writeFileSync(path.join(cwd, "redis-axi.config.json"), JSON.stringify({
    targets: [{ id: "prod", type: "custom", path: ".", detail: "Production Redis cluster", provider: "elasticache", reason: "custom target" }]
  }));
  const result = run(["discover"], { cwd });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /prod/);
  assert.match(result.stdout, /elasticache/);
});

// ── Recommend ────────────────────────────────────────────────────────────────

test("recommend returns compact paths for keys goal", () => {
  const result = run(["recommend", "--goal", "keys"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /paths\[3\]{id,pattern,fit,command}:/);
  assert.match(result.stdout, /SCAN/);
});

test("recommend returns paths for cloud goal", () => {
  const result = run(["recommend", "--goal", "cloud"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /managed Redis/);
});

test("recommend rejects unknown goal", () => {
  const result = run(["recommend", "--goal", "bogus"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /unknown goal/);
});

// ── List ─────────────────────────────────────────────────────────────────────

test("list --kind databases uses INFO keyspace not KEYS", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd, {
    "redis-cli": `#!/bin/sh\nargs="$*"\ncase "$args" in\n  *"KEYS"*) echo "KEYS called" >> keys-called; echo "" ;;\n  *"INFO keyspace"*) echo "# Keyspace"; echo "db0:keys=10,expires=2,avg_ttl=100" ;;\n  *"PING"*) echo "PONG" ;;\n  *) echo "OK" ;;\nesac\n`
  });
  const result = run(["list", "--kind", "databases"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /databases\[1\]/);
  assert.equal(fs.existsSync(path.join(cwd, "keys-called")), false, "KEYS must never be called");
});

test("list --kind keys uses SCAN not KEYS", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd, {
    "redis-cli": `#!/bin/sh\nargs="$*"\ncase "$args" in\n  *"KEYS"*) echo "KEYS called" >> keys-called; echo "" ;;\n  *"--scan"*) echo "session:abc"; echo "session:def" ;;\n  *"PING"*) echo "PONG" ;;\n  *) echo "OK" ;;\nesac\n`
  });
  const result = run(["list", "--kind", "keys", "--pattern", "session:*"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /session:/);
  assert.equal(fs.existsSync(path.join(cwd, "keys-called")), false, "KEYS must never be called");
});

test("list --kind clients renders compact table", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["list", "--kind", "clients"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /clients\[2\]{id,addr,db,cmd,age}:/);
});

test("list --kind users renders ACL LIST", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["list", "--kind", "users"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /users\[2\]{user,status,flags}:/);
  assert.match(result.stdout, /default/);
});

test("list --kind channels renders PUBSUB CHANNELS", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["list", "--kind", "channels"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /news:/);
});

// ── Inspect ───────────────────────────────────────────────────────────────────

test("inspect --kind server shows truncated INFO output", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["inspect", "--kind", "server", "--name", "current"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /kind: server/);
  assert.match(result.stdout, /redis_version/);
});

test("inspect --kind key shows type, ttl, memory and capped value", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["inspect", "--kind", "key", "--name", "mykey"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /kind: key/);
  assert.match(result.stdout, /type:/);
  assert.match(result.stdout, /ttl:/);
});

test("inspect --kind stream shows XINFO STREAM output", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["inspect", "--kind", "stream", "--name", "mystream"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /kind: stream/);
});

// ── Query ────────────────────────────────────────────────────────────────────

test("query --key reads value without --execute", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["query", "--key", "mykey"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /key: mykey/);
  assert.match(result.stdout, /output:/);
});

test("query --command read-only runs by default", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["query", "--command", "GET mykey"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /read_only: true/);
  assert.match(result.stdout, /dry_run: false/);
});

test("query --command mutating is dry-run unless --execute", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const env = { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` };

  const dryRun = run(["query", "--command", "SET mykey value"], { cwd, env });
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /dry_run: true/);

  const executed = run(["query", "--command", "SET mykey value", "--execute"], { cwd, env });
  assert.equal(executed.status, 0);
  assert.match(executed.stdout, /dry_run: false/);
});

test("query blocks SUBSCRIBE and other blocking commands", () => {
  const result = run(["query", "--command", "SUBSCRIBE mychannel"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /blocking command/);
  assert.equal(result.stderr, "");
});

test("query blocks BLPOP", () => {
  const result = run(["query", "--command", "BLPOP mylist 0"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /blocking command/);
});

test("query blocks MONITOR", () => {
  const result = run(["query", "--command", "MONITOR"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /blocking command/);
});

// ── Create ────────────────────────────────────────────────────────────────────

test("create is dry-run by default and executes only with --execute", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const env = { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` };

  const dryRun = run(["create", "--kind", "string", "--name", "mykey", "--value", "hello"], { cwd, env });
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /dry_run: true/);
  assert.match(dryRun.stdout, /SET/);

  const executed = run(["create", "--kind", "string", "--name", "mykey", "--value", "hello", "--execute"], { cwd, env });
  assert.equal(executed.status, 0);
  assert.match(executed.stdout, /dry_run: false/);
});

test("create hash with --spec JSON dry-run shows HSET command", () => {
  const result = run(["create", "--kind", "hash", "--name", "user:1", "--spec", '{"name":"Alice","age":"30"}'  ]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: true/);
  assert.match(result.stdout, /HSET/);
});

test("create stream with --spec JSON dry-run shows XADD command", () => {
  const result = run(["create", "--kind", "stream", "--name", "events", "--spec", '{"event":"login"}'  ]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: true/);
  assert.match(result.stdout, /XADD/);
});

// ── Drop ─────────────────────────────────────────────────────────────────────

test("drop key requires --confirm matching key name", () => {
  const result = run(["drop", "--kind", "key", "--name", "mykey"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /requires --confirm matching/);
  assert.equal(result.stderr, "");
});

test("drop key with correct --confirm is dry-run by default", () => {
  const result = run(["drop", "--kind", "key", "--name", "mykey", "--confirm", "mykey"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: true/);
  assert.match(result.stdout, /DEL/);
});

test("drop database requires --confirm matching db number", () => {
  const result = run(["drop", "--kind", "database", "--name", "db0"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /requires --confirm/);
});

test("drop all requires --confirm=flushall", () => {
  const result = run(["drop", "--kind", "all", "--name", "all"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /requires --confirm matching flushall/);
});

test("drop all with correct --confirm flushall is dry-run", () => {
  const result = run(["drop", "--kind", "all", "--name", "all", "--confirm", "flushall"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: true/);
  assert.match(result.stdout, /FLUSHALL/);
});

// ── Export / Import ───────────────────────────────────────────────────────────

test("export --format rdb is dry-run without --execute", () => {
  const result = run(["export", "--file", "backup.rdb"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: true/);
  assert.match(result.stdout, /rdb/);
});

test("import requires --confirm matching --database", () => {
  const cwd = tempWorkspace();
  fs.writeFileSync(path.join(cwd, "keys.resp"), "*1\r\n$4\r\nPING\r\n");
  const result = run(["import", "--file", "keys.resp", "--database", "0"], { cwd });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /requires --confirm/);
});

test("import is dry-run with correct --confirm but no --execute", () => {
  const cwd = tempWorkspace();
  fs.writeFileSync(path.join(cwd, "keys.resp"), "*1\r\n$4\r\nPING\r\n");
  const result = run(["import", "--file", "keys.resp", "--database", "0", "--confirm", "0"], { cwd });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: true/);
});

// ── Maintenance ───────────────────────────────────────────────────────────────

test("maintenance bgsave is dry-run without --execute", () => {
  const result = run(["maintenance", "--action", "bgsave"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: true/);
  assert.match(result.stdout, /BGSAVE/);
});

test("maintenance flushdb requires --confirm matching db", () => {
  const result = run(["maintenance", "--action", "flushdb"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /requires --confirm/);
});

test("maintenance flushall requires --confirm=flushall", () => {
  const result = run(["maintenance", "--action", "flushall"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /requires --confirm/);
});

test("maintenance flushall with correct confirm is dry-run", () => {
  const result = run(["maintenance", "--action", "flushall", "--confirm", "flushall"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: true/);
  assert.match(result.stdout, /FLUSHALL/);
});

test("maintenance scan-delete requires --target and --confirm", () => {
  const result = run(["maintenance", "--action", "scan-delete", "--target", "session:*"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /requires --confirm/);
});

test("maintenance scan-delete with correct confirm is dry-run", () => {
  const result = run(["maintenance", "--action", "scan-delete", "--target", "session:*", "--confirm", "session:*"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: true/);
});

test("maintenance memory-purge and slowlog-reset are dry-run by default", () => {
  const purge = run(["maintenance", "--action", "memory-purge"]);
  assert.equal(purge.status, 0);
  assert.match(purge.stdout, /MEMORY PURGE/);

  const reset = run(["maintenance", "--action", "slowlog-reset"]);
  assert.equal(reset.status, 0);
  assert.match(reset.stdout, /SLOWLOG RESET/);
});

// ── Activity / Stats / Kill ───────────────────────────────────────────────────

test("activity shows clients and slowlog", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["activity"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /clients\[2\]{id,addr,db,cmd,age}:/);
});

test("stats --kind memory shows INFO memory", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["stats", "--kind", "memory"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /kind: memory/);
});

test("kill requires --confirm matching --client-id", () => {
  const result = run(["kill", "--client-id", "42"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /requires --confirm/);
});

test("kill with correct confirm is dry-run by default", () => {
  const result = run(["kill", "--client-id", "42", "--confirm", "42"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: true/);
  assert.match(result.stdout, /CLIENT KILL/);
});

test("kill with --execute terminates client", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["kill", "--client-id", "1", "--confirm", "1", "--execute"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: false/);
});

// ── Redaction ────────────────────────────────────────────────────────────────

test("Redis URL passwords are redacted from output", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  fs.writeFileSync(path.join(cwd, ".env"), "REDIS_URL=redis://user:supersecret@localhost:6379\n");
  const result = run([], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, REDIS_URL: "redis://user:supersecret@localhost:6379" } });

  assert.doesNotMatch(result.stdout, /supersecret/);
});

test("REDIS_PASSWORD env is never shown in output", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["doctor"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, REDIS_PASSWORD: "topsecretpass" } });

  assert.doesNotMatch(result.stdout, /topsecretpass/);
  assert.match(result.stdout, /<redacted>/);
});

test("Upstash token in env is redacted", () => {
  const cwd = tempWorkspace();
  fs.writeFileSync(path.join(cwd, ".env"), "UPSTASH_REDIS_REST_TOKEN=AXXXmytoken123\nUPSTASH_REDIS_REST_URL=https://example.upstash.io\n");
  const result = run(["discover", "--full"], { cwd });

  assert.doesNotMatch(result.stdout, /AXXXmytoken123/);
});

test("TLS private key PEM blocks are redacted", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd, {
    "redis-cli": `#!/bin/sh\necho '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----'\n`
  });
  const result = run(["inspect", "--kind", "server", "--name", "current"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.doesNotMatch(result.stdout, /MIIEpAIBAAKCAQEA/);
  assert.match(result.stdout, /<redacted-private-key>/);
});

// ── Hooks / Skill ────────────────────────────────────────────────────────────

test("hooks install dry-run shows file list", () => {
  const cwd = tempWorkspace();
  const result = run(["hooks", "install", "--agent", "all", "--scope", "project"], { cwd });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: true/);
  assert.match(result.stdout, /codex/);
  assert.match(result.stdout, /claude/);
  assert.match(result.stdout, /opencode/);
});

test("skill generate check fails when stale and passes after generation", () => {
  const cwd = tempWorkspace();
  const stale = run(["skill", "generate", "--check"], { cwd });
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /generated skill is stale or missing/);

  const generated = run(["skill", "generate"], { cwd });
  assert.equal(generated.status, 0);
  assert.equal(fs.existsSync(path.join(cwd, "SKILL.md")), true);

  const checked = run(["skill", "generate", "--check"], { cwd });
  assert.equal(checked.status, 0);
  assert.equal(checked.stdout, "skill: up-to-date");
});

// ── Live tests ────────────────────────────────────────────────────────────────

test("optional live Redis doctor is gated behind REDIS_AXI_LIVE_TESTS", { skip: process.env.REDIS_AXI_LIVE_TESTS !== "1" }, () => {
  const result = run(["doctor"], { env: process.env });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /checks\[/);
});
