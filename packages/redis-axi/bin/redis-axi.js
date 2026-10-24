#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const DESCRIPTION = "Operate Redis databases through safe discover, inspect, query, export, import, and maintenance AXI workflows";
const VERSION = "0.1.0";
const PREVIEW_LIMIT = 1200;
const RESULT_LIMIT = 1600;

const GLOBAL_VALUE_FLAGS = new Set(["--cwd", "--url", "--host", "--port", "--password", "--database", "--tls-cert", "--tls-key", "--tls-ca"]);
const GLOBAL_BOOLEAN_FLAGS = new Set(["--help", "--tls"]);

const COMMANDS = {
  home: { value: new Set(), boolean: new Set(["--help"]), help: helpHome },
  doctor: { value: new Set(), boolean: new Set(["--help"]), help: helpDoctor },
  services: { value: new Set(["--fields"]), boolean: new Set(["--help"]), help: helpServices },
  discover: { value: new Set(["--fields"]), boolean: new Set(["--full", "--help"]), help: helpDiscover },
  recommend: { value: new Set(["--goal"]), boolean: new Set(["--help"]), help: helpRecommend },
  list: { value: new Set(["--kind", "--pattern", "--type", "--database", "--limit", "--fields"]), boolean: new Set(["--help"]), help: helpList },
  inspect: { value: new Set(["--kind", "--name", "--database"]), boolean: new Set(["--full", "--help"]), help: helpInspect },
  query: { value: new Set(["--key", "--command", "--file", "--database", "--limit"]), boolean: new Set(["--execute", "--full", "--help"]), help: helpQuery },
  create: { value: new Set(["--kind", "--name", "--value", "--spec", "--file", "--ttl", "--database"]), boolean: new Set(["--execute", "--help"]), help: helpCreate },
  drop: { value: new Set(["--kind", "--name", "--database", "--confirm"]), boolean: new Set(["--execute", "--help"]), help: helpDrop },
  export: { value: new Set(["--database", "--pattern", "--file", "--format"]), boolean: new Set(["--execute", "--help"]), help: helpExport },
  import: { value: new Set(["--database", "--file", "--confirm", "--format"]), boolean: new Set(["--execute", "--help"]), help: helpImport },
  maintenance: { value: new Set(["--action", "--target", "--database", "--confirm"]), boolean: new Set(["--execute", "--help"]), help: helpMaintenance },
  activity: { value: new Set(["--limit"]), boolean: new Set(["--help"]), help: helpActivity },
  stats: { value: new Set(["--kind", "--database"]), boolean: new Set(["--help"]), help: helpStats },
  kill: { value: new Set(["--client-id", "--confirm"]), boolean: new Set(["--execute", "--help"]), help: helpKill },
  "hooks install": { value: new Set(["--agent", "--scope"]), boolean: new Set(["--execute", "--help"]), help: helpHooksInstall },
  "skill generate": { value: new Set(["--output"]), boolean: new Set(["--check", "--help"]), help: helpSkillGenerate }
};

const SERVICE_DOMAINS = [
  { capability: "connection", domain: "url|host|port|db|username|password|tls|sentinel|cluster|env", use: "connect without exposing credentials" },
  { capability: "keys", domain: "scan|type|ttl|rename|expire|persist|string|hash|list|set|zset|stream", use: "discover and inspect key types safely" },
  { capability: "query", domain: "get|hgetall|lrange|smembers|zrange|xrange|capped-reads", use: "read values with truncation and redaction" },
  { capability: "mutations", domain: "set|hset|lpush|sadd|zadd|xadd|guarded-writes", use: "write with --execute guard" },
  { capability: "streams", domain: "xinfo|xrange|xlen|groups|pending|consumer-groups", use: "inspect and manage streams" },
  { capability: "pubsub", domain: "channels|patterns|shard-channels|pubsub-numsub", use: "inspect pub/sub state without blocking" },
  { capability: "acl", domain: "users|categories|permissions|auth-checks", use: "review access control posture" },
  { capability: "persistence", domain: "rdb|aof|bgsave|bgrewriteaof|restore|import", use: "inspect and plan persistence operations" },
  { capability: "operations", domain: "clients|slowlog|commandstats|memory|latency", use: "debug performance and connection state" },
  { capability: "maintenance", domain: "bgsave|memory-purge|slowlog-reset|expire|scan-delete|flushdb|flushall", use: "plan and run maintenance with guards" },
  { capability: "cluster", domain: "nodes|slots|replicas|info|failover-guidance", use: "inspect cluster topology safely" },
  { capability: "sentinel", domain: "masters|replicas|sentinels|failover-guidance", use: "inspect Sentinel topology safely" },
  { capability: "local-dev", domain: "compose|env|bull|bullmq|sidekiq|celery|rails|laravel|django|node", use: "orient local Redis development" },
  { capability: "cloud", domain: "upstash|redis-cloud|elasticache|azure-cache|gcp-memorystore|custom-target", use: "detect provider context and recommend workflows" }
];

const RECOMMENDATIONS = {
  inspect: [
    ["server", "INFO + PING readiness", "best first step before Redis work", "redis-axi doctor"],
    ["keys", "safe SCAN by type", "best for keyspace overview", "redis-axi list --kind keys --limit 50"],
    ["detail", "key-specific inspect", "best before a mutation", "redis-axi inspect --kind key --name <key>"]
  ],
  create: [
    ["string", "SET with optional TTL", "best for cache entries", "redis-axi create --kind string --name <key> --value <val>"],
    ["hash", "HSET guarded write", "best for structured objects", "redis-axi create --kind hash --name <key> --spec '{\"field\":\"val\"}'"],
    ["stream", "XADD guarded write", "best for event streams", "redis-axi create --kind stream --name <key> --spec '{\"field\":\"val\"}'"]
  ],
  query: [
    ["get", "safe string read", "best for cache inspection", "redis-axi query --key <key>"],
    ["command", "known read-only command", "best for type-specific reads", "redis-axi query --command \"HGETALL <key>\""],
    ["file", "multi-command file", "best for repeatable scripts", "redis-axi query --file <path>"]
  ],
  keys: [
    ["scan", "SCAN-based discovery", "best for safe key browsing", "redis-axi list --kind keys --pattern 'prefix:*'"],
    ["types", "type distribution", "best for keyspace overview", "redis-axi list --kind types"],
    ["ttl", "TTL summary", "best for expiry audit", "redis-axi list --kind keys --pattern '*' --limit 100"]
  ],
  streams: [
    ["info", "XINFO STREAM", "best for stream overview", "redis-axi inspect --kind stream --name <key>"],
    ["groups", "consumer group list", "best for consumer audit", "redis-axi list --kind groups --name <stream>"],
    ["pending", "pending entry summary", "best before consumer rebalance", "redis-axi inspect --kind group --name <group>"]
  ],
  pubsub: [
    ["channels", "PUBSUB CHANNELS", "best for active channel audit", "redis-axi list --kind channels"],
    ["patterns", "PUBSUB NUMPAT", "best for pattern subscription count", "redis-axi stats --kind pubsub"],
    ["numsub", "subscriber counts", "best for channel load", "redis-axi list --kind channels"]
  ],
  export: [
    ["rdb", "redis-cli --rdb snapshot", "best for full backup", "redis-axi export --file backup.rdb --format rdb"],
    ["pattern", "key dump by pattern", "best for subset export", "redis-axi export --pattern 'prefix:*' --file keys.resp --format resp"],
    ["guidance", "cloud backup guidance", "best for managed Redis", "redis-axi recommend --goal cloud"]
  ],
  import: [
    ["resp", "RESP file replay", "best for key restore", "redis-axi import --file keys.resp --confirm <db> --format resp"],
    ["preflight", "inspect target DB first", "best before overwrite risk", "redis-axi inspect --kind database --name <n>"],
    ["guidance", "provider restore guidance", "best for managed Redis", "redis-axi doctor"]
  ],
  roles: [
    ["list", "ACL LIST", "best for access review", "redis-axi list --kind users"],
    ["inspect", "ACL GETUSER", "best before permission grants", "redis-axi inspect --kind user --name <user>"],
    ["create", "ACL SETUSER guarded", "best for new app principals", "redis-axi create --kind user --name <user>"]
  ],
  performance: [
    ["slowlog", "SLOWLOG GET", "best for slow command review", "redis-axi list --kind slowlog"],
    ["memory", "MEMORY STATS", "best for memory pressure", "redis-axi stats --kind memory"],
    ["latency", "LATENCY LATEST", "best for latency spikes", "redis-axi stats --kind latency"]
  ],
  maintenance: [
    ["bgsave", "background RDB save plan", "best before config changes", "redis-axi maintenance --action bgsave"],
    ["memory-purge", "MEMORY PURGE plan", "best for memory reclaim", "redis-axi maintenance --action memory-purge"],
    ["slowlog-reset", "SLOWLOG RESET plan", "best after performance review", "redis-axi maintenance --action slowlog-reset"]
  ],
  cluster: [
    ["nodes", "CLUSTER NODES", "best for topology review", "redis-axi list --kind cluster-nodes"],
    ["slots", "CLUSTER SLOTS", "best for slot distribution", "redis-axi stats --kind cluster"],
    ["sentinel", "SENTINEL MASTERS", "best for Sentinel audit", "redis-axi list --kind sentinels"]
  ],
  cloud: [
    ["detect", "provider config scan", "best first step for managed Redis", "redis-axi discover --full"],
    ["connect", "Redis URL connection", "best for provider-neutral ops", "redis-axi doctor --url <redis-url>"],
    ["custom", "redis-axi.config.json target", "best for explicit lifecycle commands", "redis-axi discover"]
  ],
  "local-dev": [
    ["compose", "Docker Compose Redis service", "best for local stacks", "redis-axi discover"],
    ["env", "REDIS_URL env detection", "best for app config review", "redis-axi discover --full"],
    ["readiness", "PING check", "best before tests", "redis-axi doctor"]
  ]
};

const BLOCKING_COMMANDS = new Set(["subscribe", "psubscribe", "ssubscribe", "blpop", "brpop", "blmove", "blmpop", "bzpopmin", "bzpopmax", "bzmpop", "xread", "monitor", "wait"]);
const WRITE_COMMANDS = new Set(["set", "mset", "msetnx", "getset", "setex", "psetex", "setnx", "setrange", "append", "incr", "incrby", "incrbyfloat", "decr", "decrby", "del", "unlink", "rename", "renamenx", "expire", "expireat", "pexpire", "pexpireat", "persist", "move", "copy", "restore", "dump", "sort", "hset", "hmset", "hsetnx", "hincrby", "hincrbyfloat", "hdel", "lpush", "lpushx", "rpush", "rpushx", "linsert", "lset", "ltrim", "lpop", "rpop", "lmove", "lmpop", "sadd", "srem", "smove", "spop", "sdiffstore", "sinterstore", "sunionstore", "zadd", "zrem", "zincrby", "zpopmin", "zpopmax", "zmpop", "zrangestore", "zdiffstore", "zinterstore", "zunionstore", "xadd", "xtrim", "xdel", "xgroup", "xack", "xclaim", "xautoclaim", "flushdb", "flushall", "acl", "config", "debug", "slaveof", "replicaof", "failover", "reset", "swapdb", "object"]);

main();

function main() {
  const commandInfo = resolveCommand(process.argv.slice(2));
  const config = COMMANDS[commandInfo.command];
  if (!config) usageError(`unknown command ${toonScalar(commandInfo.command)}`, ["Run `redis-axi --help` for available commands"]);
  const parsed = parseArgs(commandInfo.command, commandInfo.args, config);
  if (parsed.flags.help) {
    print(config.help());
    return;
  }
  const context = buildContext(parsed.flags);
  const handlers = {
    home,
    doctor,
    services,
    discover,
    recommend,
    list,
    inspect,
    query,
    create,
    drop: dropObject,
    export: exportData,
    import: importData,
    maintenance,
    activity,
    stats,
    kill: killClient,
    "hooks install": hooksInstall,
    "skill generate": skillGenerate
  };
  handlers[commandInfo.command](parsed, context);
}

function resolveCommand(args) {
  if (args.length === 0 || args[0].startsWith("--")) return { command: "home", args };
  if (["hooks", "skill"].includes(args[0]) && args[1] && !args[1].startsWith("--")) {
    return { command: `${args[0]} ${args[1]}`, args: args.slice(2) };
  }
  return { command: args[0], args: args.slice(1) };
}

function parseArgs(command, args, config) {
  const valueFlags = new Set([...GLOBAL_VALUE_FLAGS, ...config.value]);
  const booleanFlags = new Set([...GLOBAL_BOOLEAN_FLAGS, ...config.boolean]);
  const flags = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [rawName, inlineValue] = arg.split("=", 2);
    if (!valueFlags.has(rawName) && !booleanFlags.has(rawName)) {
      usageError(`unknown flag ${rawName} for \`${command}\``, [`valid flags for \`${command}\`: ${validFlags(valueFlags, booleanFlags)}`]);
    }
    if (booleanFlags.has(rawName)) {
      if (inlineValue !== undefined) usageError(`${rawName} does not take a value`, [`Run \`redis-axi ${command} --help\` for examples`]);
      flags[flagName(rawName)] = true;
      continue;
    }
    const value = inlineValue ?? args[index + 1];
    if (value === undefined || value.startsWith("--")) usageError(`${rawName} requires a value`, [`Run \`redis-axi ${command} --help\` for examples`]);
    flags[flagName(rawName)] = value;
    if (inlineValue === undefined) index += 1;
  }
  if (positional.length > 0) usageError(`unexpected argument ${toonScalar(positional[0])} for \`${command}\``, [`Run \`redis-axi ${command} --help\` for examples`]);
  return { flags, positional };
}

function validFlags(valueFlags, booleanFlags) {
  return [...new Set([...valueFlags, ...booleanFlags])].sort().join(", ");
}

function flagName(rawName) {
  return rawName.slice(2).replaceAll("-", "_");
}

function buildContext(flags) {
  const rawUrl = flags.url ?? process.env.REDIS_URL ?? process.env.REDIS_URI ?? "";
  return {
    cwd: path.resolve(flags.cwd ?? process.cwd()),
    url: rawUrl,
    host: flags.host ?? process.env.REDIS_HOST ?? "",
    port: flags.port ?? process.env.REDIS_PORT ?? "",
    password: flags.password ?? process.env.REDIS_PASSWORD ?? process.env.REDISCLI_AUTH ?? "",
    database: flags.database ?? process.env.REDIS_DB ?? process.env.REDIS_DATABASE ?? "",
    tls: flags.tls ?? (rawUrl.startsWith("rediss://") || process.env.REDIS_TLS === "true" || process.env.REDIS_TLS === "1" ? true : false),
    tlsCert: flags.tls_cert ?? process.env.REDIS_TLS_CERT ?? "",
    tlsKey: flags.tls_key ?? process.env.REDIS_TLS_KEY ?? "",
    tlsCa: flags.tls_ca ?? process.env.REDIS_TLS_CA ?? ""
  };
}

// ── Commands ──────────────────────────────────────────────────────────────────

function home(_parsed, context) {
  const state = redisState(context);
  const targets = discoverTargets(context);
  const rows = targets.slice(0, 8).map((t) => ({ id: t.id, type: t.type, source: displayPath(t.path, context.cwd), detail: t.detail }));
  const lines = [
    `bin: ${toonScalar(collapseHome(process.argv[1]))}`,
    `description: ${toonScalar(DESCRIPTION)}`,
    `version: ${VERSION}`,
    "redis:",
    `  redis-cli: ${state.redisCli}`,
    `  ready: ${state.ready}`,
    `  target: ${toonScalar(connectionLabel(context))}`,
    `  version: ${toonScalar(state.version)}`,
    `  mode: ${toonScalar(state.mode)}`,
    `  role: ${toonScalar(state.role)}`,
    `  selected_db: ${toonScalar(state.selectedDb)}`,
    "counts:",
    `  keys: ${state.keys}`,
    `  clients: ${state.clients}`,
    `  memory: ${toonScalar(state.memory)}`,
    `targets_count: ${targets.length}`
  ];
  if (rows.length === 0) lines.push("targets: 0 Redis targets detected in this workspace");
  else lines.push(formatTable("targets", rows, ["id", "type", "source", "detail"]));
  const help = ["Run `redis-axi doctor` to check Redis readiness", "Run `redis-axi discover --full` to inspect project Redis targets"];
  if (targets.length > 0) help.push("Run `redis-axi inspect --kind server --name current` before mutating");
  else help.push("Run `redis-axi recommend --goal local-dev` to choose a Redis path");
  lines.push(formatHelp(help));
  print(lines.join("\n"));
}

function doctor(_parsed, context) {
  const cliPath = findExecutable("redis-cli");
  const serverPath = findExecutable("redis-server");
  const ready = pingReady(context);
  const info = cliPath && ready.ok ? redisInfo(context, "server") : {};
  const rows = [
    { check: "redis-cli", status: cliPath ? "ok" : "missing", detail: cliPath ? collapseHome(cliPath) : "install Redis client tools" },
    { check: "redis-server", status: serverPath ? "ok" : "optional", detail: serverPath ? collapseHome(serverPath) : "optional for local dev" },
    { check: "ready", status: ready.ok ? "ok" : "error", detail: ready.detail },
    { check: "connection", status: cliPath && ready.ok ? "ok" : "unknown", detail: ready.ok ? connectionLabel(context) : "not connected" },
    { check: "tls", status: context.tls ? "enabled" : "disabled", detail: context.tls ? `cert:${context.tlsCert || "default"} key:${context.tlsKey || "default"}` : "plaintext" },
    { check: "auth", status: context.password ? "configured" : "none", detail: context.password ? "<redacted>" : "no password set" },
    { check: "version", status: info.redis_version ? "ok" : "unknown", detail: info.redis_version || "not available" },
    { check: "mode", status: info.redis_mode ? "ok" : "unknown", detail: info.redis_mode || "not available" },
    { check: "persistence", status: info.rdb_last_bgsave_status || info.aof_enabled !== undefined ? "ok" : "unknown", detail: persistenceDetail(info) },
    { check: "managed", status: managedHints(context).length ? "detected" : "none", detail: managedHints(context).map((h) => h.provider).join("|") || "no provider config hints" }
  ];
  print([
    `summary: ${cliPath && ready.ok ? "ready" : "attention-required"}`,
    formatTable("checks", rows, ["check", "status", "detail"]),
    formatHelp(["Run `redis-axi discover` to list Redis targets", "Run `redis-axi services` to inspect supported Redis domains"])
  ].join("\n"));
}

function services(parsed) {
  const fields = parseFields(parsed.flags.fields, ["capability", "domain", "use"], ["capability", "domain", "use"]);
  const rows = SERVICE_DOMAINS.map((row) => pick(row, fields));
  const lines = [`count: ${rows.length} Redis domains`];
  lines.push(formatTable("services", rows, fields));
  lines.push(formatHelp(["Run `redis-axi recommend --goal <inspect|create|query|keys|streams|pubsub|export|import|roles|performance|maintenance|cluster|cloud|local-dev>` for workflow paths"]));
  print(lines.join("\n"));
}

function discover(parsed, context) {
  const fields = parseFields(parsed.flags.fields, ["id", "type", "source", "detail"], ["id", "type", "source", "detail", "provider", "reason"]);
  const targets = discoverTargets(context);
  const rows = targets.map((t) => {
    const row = { ...t, source: displayPath(t.path, context.cwd) };
    if (!parsed.flags.full) {
      row.detail = truncate(row.detail ?? "", 120).text;
      row.reason = truncate(row.reason ?? "", 120).text;
    }
    return pick(row, fields);
  });
  const lines = [`count: ${rows.length} Redis targets detected`];
  if (rows.length === 0) lines.push("targets: 0 Redis targets detected in this workspace");
  else lines.push(formatTable("targets", rows, fields));
  lines.push(formatHelp(["Run `redis-axi doctor` to check connection readiness", "Run `redis-axi recommend --goal inspect` for next steps"]));
  print(lines.join("\n"));
}

function recommend(parsed) {
  const goal = parsed.flags.goal;
  if (!goal) usageError("--goal is required", ["Run `redis-axi recommend --goal <inspect|create|query|keys|streams|pubsub|export|import|roles|performance|maintenance|cluster|cloud|local-dev>`"]);
  const rows = RECOMMENDATIONS[goal];
  if (!rows) usageError(`unknown goal ${toonScalar(goal)}`, ["valid goals: inspect, create, query, keys, streams, pubsub, export, import, roles, performance, maintenance, cluster, cloud, local-dev"]);
  print([
    `goal: ${goal}`,
    formatTable("paths", rows.map(([id, pattern, fit, command]) => ({ id, pattern, fit, command })), ["id", "pattern", "fit", "command"]),
    formatHelp(["Run the suggested command for the path that best matches the Redis task"])
  ].join("\n"));
}

function list(parsed, context) {
  const kind = parsed.flags.kind;
  if (!kind) usageError("--kind is required", ["Run `redis-axi list --kind <databases|keys|types|streams|groups|clients|channels|users|slowlog|cluster-nodes|sentinels>`"]);
  ensureTool("redis-cli", "list");
  const limit = parsePositiveInteger(parsed.flags.limit ?? "100", "--limit");
  const db = parsed.flags.database ?? context.database;

  if (kind === "databases") {
    const result = redisCmd(["INFO", "keyspace"], context);
    if (result.status !== 0) runtimeError("redis list databases failed", [sanitize(result.stderr || result.stdout)]);
    const lines = result.stdout.split(/\r?\n/).filter((l) => /^db\d+:/.test(l)).slice(0, limit);
    const rows = lines.map((line) => {
      const m = line.match(/^(db\d+):keys=(\d+),expires=(\d+)/);
      return m ? { database: m[1], keys: m[2], expires: m[3] } : { database: line, keys: "", expires: "" };
    });
    if (rows.length === 0) print("databases: 0 databases with keys");
    else print([`count: ${rows.length} databases`, formatTable("databases", rows, ["database", "keys", "expires"])].join("\n"));
    return;
  }

  if (kind === "keys") {
    const pattern = parsed.flags.pattern ?? "*";
    const typeFilter = parsed.flags.type ?? "";
    const scanArgs = ["--scan", "--pattern", pattern, "-n", db || "0", "--count", "100"];
    const result = redisCmd(scanArgs, context);
    if (result.status !== 0) runtimeError("redis SCAN failed", [sanitize(result.stderr || result.stdout)]);
    let keys = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, limit);
    if (typeFilter) keys = keys.filter((k) => getKeyType(k, context) === typeFilter);
    if (keys.length === 0) print(`keys: 0 keys found matching ${toonScalar(pattern)}`);
    else print([`count: ${keys.length} keys`, formatTable("keys", keys.map((k) => ({ key: sanitize(k) })), ["key"])].join("\n"));
    return;
  }

  if (kind === "types") {
    const result = redisCmd(["--scan", "--pattern", parsed.flags.pattern ?? "*", "-n", db || "0", "--count", "200"], context);
    if (result.status !== 0) runtimeError("redis SCAN for types failed", [sanitize(result.stderr || result.stdout)]);
    const keys = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, limit);
    const counts = {};
    for (const k of keys) {
      const t = getKeyType(k, context);
      counts[t] = (counts[t] || 0) + 1;
    }
    const rows = Object.entries(counts).map(([type, count]) => ({ type, count: String(count) }));
    if (rows.length === 0) print("types: 0 keys found");
    else print([`count: ${rows.length} types`, formatTable("types", rows, ["type", "count"])].join("\n"));
    return;
  }

  if (kind === "streams") {
    const pattern = parsed.flags.pattern ?? "*";
    const scanArgs = ["--scan", "--pattern", pattern, "-n", db || "0", "--count", "100"];
    const result = redisCmd(scanArgs, context);
    if (result.status !== 0) runtimeError("redis SCAN failed", [sanitize(result.stderr || result.stdout)]);
    const keys = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const streams = keys.filter((k) => getKeyType(k, context) === "stream").slice(0, limit);
    if (streams.length === 0) print("streams: 0 stream keys found");
    else print([`count: ${streams.length} streams`, formatTable("streams", streams.map((k) => ({ stream: k })), ["stream"])].join("\n"));
    return;
  }

  if (kind === "groups") {
    const name = parsed.flags.name;
    if (!name) usageError("--name <stream> is required for list --kind groups", ["Run `redis-axi list --kind groups --name <stream>`"]);
    const result = redisCmd(["-n", db || "0", "XINFO", "GROUPS", name], context);
    if (result.status !== 0) runtimeError("redis XINFO GROUPS failed", [sanitize(result.stderr || result.stdout)]);
    const rows = parseXinfoGroups(result.stdout).slice(0, limit);
    if (rows.length === 0) print(`groups: 0 consumer groups for ${toonScalar(name)}`);
    else print([`count: ${rows.length} groups`, formatTable("groups", rows, ["name", "consumers", "pending", "last_delivered"])].join("\n"));
    return;
  }

  if (kind === "clients") {
    const result = redisCmd(["CLIENT", "LIST"], context);
    if (result.status !== 0) runtimeError("redis CLIENT LIST failed", [sanitize(result.stderr || result.stdout)]);
    const rows = parseClientList(result.stdout).slice(0, limit);
    if (rows.length === 0) print("clients: 0 clients found");
    else print([`count: ${rows.length} clients`, formatTable("clients", rows, ["id", "addr", "db", "cmd", "age"])].join("\n"));
    return;
  }

  if (kind === "channels") {
    const result = redisCmd(["PUBSUB", "CHANNELS", parsed.flags.pattern ?? "*"], context);
    if (result.status !== 0) runtimeError("redis PUBSUB CHANNELS failed", [sanitize(result.stderr || result.stdout)]);
    const channels = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l) => !/^\d+\)/.test(l) === false || true).slice(0, limit);
    const clean = channels.filter((l) => l && !/^#/.test(l));
    if (clean.length === 0) print("channels: 0 active channels");
    else print([`count: ${clean.length} channels`, formatTable("channels", clean.map((c) => ({ channel: c })), ["channel"])].join("\n"));
    return;
  }

  if (kind === "users") {
    const result = redisCmd(["ACL", "LIST"], context);
    if (result.status !== 0) runtimeError("redis ACL LIST failed", [sanitize(result.stderr || result.stdout)]);
    const rows = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, limit).map((line) => {
      const parts = line.replace(/^user\s+/, "").split(/\s+/);
      return { user: sanitize(parts[0] ?? ""), status: parts[1] ?? "", flags: sanitize(parts.slice(2).join(" ")) };
    });
    if (rows.length === 0) print("users: 0 ACL users found");
    else print([`count: ${rows.length} users`, formatTable("users", rows, ["user", "status", "flags"])].join("\n"));
    return;
  }

  if (kind === "slowlog") {
    const result = redisCmd(["SLOWLOG", "GET", String(limit)], context);
    if (result.status !== 0) runtimeError("redis SLOWLOG GET failed", [sanitize(result.stderr || result.stdout)]);
    const rows = parseSlowlog(result.stdout).slice(0, limit);
    if (rows.length === 0) print("slowlog: 0 slow entries found");
    else print([`count: ${rows.length} slowlog entries`, formatTable("slowlog", rows, ["id", "duration_us", "command"])].join("\n"));
    return;
  }

  if (kind === "cluster-nodes") {
    const result = redisCmd(["CLUSTER", "NODES"], context);
    if (result.status !== 0) runtimeError("redis CLUSTER NODES failed (may not be a cluster)", [sanitize(result.stderr || result.stdout)]);
    const rows = result.stdout.split(/\r?\n/).filter(Boolean).slice(0, limit).map((line) => {
      const parts = line.split(/\s+/);
      return { id: (parts[0] ?? "").slice(0, 12), addr: sanitize(parts[1] ?? ""), flags: parts[2] ?? "", slots: parts[8] ?? "" };
    });
    if (rows.length === 0) print("cluster-nodes: 0 cluster nodes found");
    else print([`count: ${rows.length} cluster nodes`, formatTable("cluster-nodes", rows, ["id", "addr", "flags", "slots"])].join("\n"));
    return;
  }

  if (kind === "sentinels") {
    const result = redisCmd(["SENTINEL", "SENTINELS", parsed.flags.name ?? "mymaster"], context);
    if (result.status !== 0) runtimeError("redis SENTINEL SENTINELS failed (may not be a Sentinel)", [sanitize(result.stderr || result.stdout)]);
    const rows = parseRedisPairs(result.stdout).slice(0, limit);
    if (rows.length === 0) print("sentinels: 0 sentinels found");
    else print([`count: ${rows.length} sentinels`, formatTable("sentinels", rows.map((r) => ({ name: r.name ?? "", ip: sanitize(r.ip ?? ""), port: r.port ?? "", flags: r.flags ?? "" })), ["name", "ip", "port", "flags"])].join("\n"));
    return;
  }

  usageError(`unknown list kind ${toonScalar(kind)}`, ["valid kinds: databases, keys, types, streams, groups, clients, channels, users, slowlog, cluster-nodes, sentinels"]);
}

function inspect(parsed, context) {
  const kind = parsed.flags.kind;
  const name = parsed.flags.name;
  if (!kind) usageError("--kind is required", ["Run `redis-axi inspect --kind <server|database|key|stream|group|client|user|slowlog|cluster|sentinel> --name <name>`"]);
  ensureTool("redis-cli", "inspect");
  const db = parsed.flags.database ?? context.database;

  if (kind === "server") {
    const result = redisCmd(["INFO", "all"], context);
    if (result.status !== 0) runtimeError("redis INFO failed", [sanitize(result.stderr || result.stdout)]);
    const output = sanitize(result.stdout);
    const preview = parsed.flags.full ? output : truncate(output, PREVIEW_LIMIT).text;
    const lines = ["inspect:", `  kind: server`, `  output: ${toonScalar(preview)}`];
    if (!parsed.flags.full && truncate(output, PREVIEW_LIMIT).truncated) lines.push(formatHelp(["Run `redis-axi inspect --kind server --name current --full` for complete output"]));
    print(lines.join("\n"));
    return;
  }

  if (kind === "database") {
    const n = name ?? db ?? "0";
    const infoResult = redisCmd(["INFO", "keyspace"], context);
    const dbInfo = infoResult.status === 0 ? sanitize(infoResult.stdout) : "";
    const dbLine = dbInfo.split(/\r?\n/).find((l) => l.startsWith(`db${n}:`)) ?? `db${n}: no data`;
    print(["inspect:", `  kind: database`, `  name: ${toonScalar(n)}`, `  keyspace: ${toonScalar(dbLine)}`].join("\n"));
    return;
  }

  if (kind === "key") {
    if (!name) usageError("--name is required for inspect --kind key", ["Run `redis-axi inspect --kind key --name <key>`"]);
    const typeResult = redisCmd(["-n", db || "0", "TYPE", name], context);
    const ttlResult = redisCmd(["-n", db || "0", "TTL", name], context);
    const memResult = redisCmd(["-n", db || "0", "MEMORY", "USAGE", name], context);
    const keyType = typeResult.stdout.trim();
    const ttl = ttlResult.stdout.trim();
    const mem = memResult.stdout.trim();
    const valueResult = readKeyValue(name, keyType, db, context, 10);
    const rawValue = valueResult.status === 0 ? valueResult.stdout : "";
    const safeValue = parsed.flags.full ? sanitize(rawValue) : truncate(sanitize(rawValue), PREVIEW_LIMIT).text;
    const lines = ["inspect:", `  kind: key`, `  name: ${toonScalar(sanitize(name))}`, `  type: ${toonScalar(keyType)}`, `  ttl: ${toonScalar(ttl)}`, `  memory_bytes: ${toonScalar(mem)}`, `  value: ${toonScalar(safeValue)}`];
    if (!parsed.flags.full && truncate(sanitize(rawValue), PREVIEW_LIMIT).truncated) lines.push(formatHelp([`Run \`redis-axi inspect --kind key --name ${name} --full\` for complete output`]));
    print(lines.join("\n"));
    return;
  }

  if (kind === "stream") {
    if (!name) usageError("--name is required for inspect --kind stream", ["Run `redis-axi inspect --kind stream --name <key>`"]);
    const result = redisCmd(["-n", db || "0", "XINFO", "STREAM", name], context);
    if (result.status !== 0) runtimeError("redis XINFO STREAM failed", [sanitize(result.stderr || result.stdout)]);
    const output = sanitize(result.stdout);
    const preview = parsed.flags.full ? output : truncate(output, PREVIEW_LIMIT).text;
    print(["inspect:", `  kind: stream`, `  name: ${toonScalar(name)}`, `  output: ${toonScalar(preview)}`].join("\n"));
    return;
  }

  if (kind === "group") {
    if (!name) usageError("--name <stream:group> is required for inspect --kind group", ["Run `redis-axi inspect --kind group --name <stream:group>`"]);
    const [stream, group] = name.split(":").map((s) => s.trim());
    if (!stream || !group) usageError("--name must be <stream:group>", ["Run `redis-axi inspect --kind group --name mystream:mygroup`"]);
    const result = redisCmd(["-n", db || "0", "XPENDING", stream, group, "-", "+", "10"], context);
    if (result.status !== 0) runtimeError("redis XPENDING failed", [sanitize(result.stderr || result.stdout)]);
    const output = sanitize(result.stdout);
    const preview = truncate(output, PREVIEW_LIMIT).text;
    print(["inspect:", `  kind: group`, `  stream: ${toonScalar(stream)}`, `  group: ${toonScalar(group)}`, `  pending: ${toonScalar(preview)}`].join("\n"));
    return;
  }

  if (kind === "client") {
    if (!name) usageError("--name is required for inspect --kind client", ["Run `redis-axi inspect --kind client --name <id>`"]);
    const result = redisCmd(["CLIENT", "LIST"], context);
    if (result.status !== 0) runtimeError("redis CLIENT LIST failed", [sanitize(result.stderr || result.stdout)]);
    const clients = parseClientList(result.stdout);
    const client = clients.find((c) => c.id === name);
    if (!client) { print(`inspect:\n  kind: client\n  name: ${toonScalar(name)}\n  status: not-found`); return; }
    print(["inspect:", `  kind: client`, `  id: ${toonScalar(client.id)}`, `  addr: ${toonScalar(sanitize(client.addr))}`, `  db: ${toonScalar(client.db)}`, `  cmd: ${toonScalar(client.cmd)}`, `  age: ${toonScalar(client.age)}`].join("\n"));
    return;
  }

  if (kind === "user") {
    if (!name) usageError("--name is required for inspect --kind user", ["Run `redis-axi inspect --kind user --name <username>`"]);
    const result = redisCmd(["ACL", "GETUSER", name], context);
    if (result.status !== 0) runtimeError("redis ACL GETUSER failed", [sanitize(result.stderr || result.stdout)]);
    const output = sanitize(result.stdout);
    const preview = parsed.flags.full ? output : truncate(output, PREVIEW_LIMIT).text;
    print(["inspect:", `  kind: user`, `  name: ${toonScalar(name)}`, `  output: ${toonScalar(preview)}`].join("\n"));
    return;
  }

  if (kind === "cluster") {
    const result = redisCmd(["CLUSTER", "INFO"], context);
    if (result.status !== 0) runtimeError("redis CLUSTER INFO failed (may not be a cluster)", [sanitize(result.stderr || result.stdout)]);
    print(["inspect:", `  kind: cluster`, `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`].join("\n"));
    return;
  }

  if (kind === "sentinel") {
    const master = name ?? "mymaster";
    const result = redisCmd(["SENTINEL", "MASTER", master], context);
    if (result.status !== 0) runtimeError("redis SENTINEL MASTER failed (may not be a Sentinel)", [sanitize(result.stderr || result.stdout)]);
    const output = sanitize(result.stdout);
    print(["inspect:", `  kind: sentinel`, `  master: ${toonScalar(master)}`, `  output: ${toonScalar(truncate(output, PREVIEW_LIMIT).text)}`].join("\n"));
    return;
  }

  if (kind === "slowlog") {
    const result = redisCmd(["SLOWLOG", "GET", "10"], context);
    if (result.status !== 0) runtimeError("redis SLOWLOG GET failed", [sanitize(result.stderr || result.stdout)]);
    print(["inspect:", `  kind: slowlog`, `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`].join("\n"));
    return;
  }

  usageError(`unknown inspect kind ${toonScalar(kind)}`, ["valid kinds: server, database, key, stream, group, client, user, slowlog, cluster, sentinel"]);
}

function query(parsed, context) {
  const db = parsed.flags.database ?? context.database;
  const limit = parsePositiveInteger(parsed.flags.limit ?? "100", "--limit");

  if (parsed.flags.key) {
    ensureTool("redis-cli", "query");
    const typeResult = redisCmd(["-n", db || "0", "TYPE", parsed.flags.key], context);
    const keyType = typeResult.stdout.trim();
    const result = readKeyValue(parsed.flags.key, keyType, db, context, limit);
    if (result.status !== 0) runtimeError("redis query failed", [sanitize(result.stderr || result.stdout)]);
    const output = sanitize(result.stdout);
    const body = parsed.flags.full ? output : truncate(output, RESULT_LIMIT).text;
    const lines = ["query:", `  key: ${toonScalar(sanitize(parsed.flags.key))}`, `  type: ${toonScalar(keyType)}`, `  output: ${toonScalar(body)}`];
    if (!parsed.flags.full && truncate(output, RESULT_LIMIT).truncated) lines.push(formatHelp([`Run \`redis-axi query --key ${parsed.flags.key} --full\` for complete output`]));
    print(lines.join("\n"));
    return;
  }

  if (parsed.flags.command) {
    const cmd = parsed.flags.command.trim();
    const firstWord = cmd.split(/\s+/)[0].toLowerCase();
    if (BLOCKING_COMMANDS.has(firstWord)) {
      usageError(`blocking command ${toonScalar(firstWord)} is not allowed by default`, ["redis-axi does not run blocking commands; use redis-cli directly for pub/sub or blocking reads"]);
    }
    const isWrite = WRITE_COMMANDS.has(firstWord);
    if (isWrite && !parsed.flags.execute) {
      print(["query:", "  dry_run: true", `  read_only: false`, `  command: ${toonScalar(sanitize(cmd))}`, formatHelp(["Add `--execute` to run this mutating command after review"])].join("\n"));
      return;
    }
    ensureTool("redis-cli", "query");
    const args = ["-n", db || "0", ...shellSplit(cmd)];
    const result = redisCmd(args, context);
    if (result.status !== 0) runtimeError("redis command failed", [sanitize(result.stderr || result.stdout)]);
    const output = sanitize(result.stdout);
    const body = parsed.flags.full ? output : truncate(output, RESULT_LIMIT).text;
    const lines = ["query:", `  read_only: ${!isWrite}`, "  dry_run: false", `  command: ${toonScalar(sanitize(cmd))}`, `  output: ${toonScalar(body)}`];
    if (!parsed.flags.full && truncate(output, RESULT_LIMIT).truncated) lines.push(formatHelp(["Add `--full` for complete output"]));
    print(lines.join("\n"));
    return;
  }

  if (parsed.flags.file) {
    const filePath = path.resolve(context.cwd, parsed.flags.file);
    if (!fs.existsSync(filePath)) usageError(`file not found: ${parsed.flags.file}`, ["Provide a path to a valid redis command file"]);
    const content = safeRead(filePath);
    const lines2 = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    const hasBlocking = lines2.some((l) => BLOCKING_COMMANDS.has(l.split(/\s+/)[0].toLowerCase()));
    if (hasBlocking) usageError("file contains blocking commands which are not allowed by default", ["Remove SUBSCRIBE, BLPOP, MONITOR, XREAD BLOCK from the file"]);
    const hasWrite = lines2.some((l) => WRITE_COMMANDS.has(l.split(/\s+/)[0].toLowerCase()));
    if (hasWrite && !parsed.flags.execute) {
      print(["query:", "  dry_run: true", `  read_only: false`, `  file: ${toonScalar(parsed.flags.file)}`, `  commands: ${lines2.length}`, formatHelp(["Add `--execute` to run this file after review"])].join("\n"));
      return;
    }
    ensureTool("redis-cli", "query");
    const result = redisCmd(["-n", db || "0", "--pipe"], context, content);
    if (result.status !== 0) runtimeError("redis file query failed", [sanitize(result.stderr || result.stdout)]);
    const output = sanitize(result.stdout);
    print(["query:", `  file: ${toonScalar(parsed.flags.file)}`, "  dry_run: false", `  output: ${toonScalar(parsed.flags.full ? output : truncate(output, RESULT_LIMIT).text)}`].join("\n"));
    return;
  }

  usageError("--key, --command, or --file is required", ["Run `redis-axi query --key <key>`", "Run `redis-axi query --command \"GET <key>\"`"]);
}

function create(parsed, context) {
  const kind = parsed.flags.kind;
  const name = parsed.flags.name;
  if (!kind) usageError("--kind is required", ["Run `redis-axi create --kind <key|string|hash|list|set|zset|stream|user|group> --name <name>`"]);
  if (!name) usageError("--name is required", ["Run `redis-axi create --kind string --name <key> --value <value>`"]);
  const db = parsed.flags.database ?? context.database;
  const ttl = parsed.flags.ttl;

  const command = buildCreateCommand(kind, name, parsed.flags, db);
  if (!command) usageError(`unknown create kind ${toonScalar(kind)}`, ["valid kinds: key, string, hash, list, set, zset, stream, user, group"]);

  if (!parsed.flags.execute) {
    print(["create:", "  dry_run: true", `  kind: ${kind}`, `  name: ${toonScalar(sanitize(name))}`, `  command: ${toonScalar(sanitize(command.join(" ")))}`, formatHelp([`Run \`redis-axi create --kind ${kind} --name ${name} --execute\` to create after review`])].join("\n"));
    return;
  }
  ensureTool("redis-cli", "create");
  const result = redisCmd(command, context);
  if (result.status !== 0) runtimeError("redis create command failed", [sanitize(result.stderr || result.stdout)]);
  const lines = ["create:", "  dry_run: false", `  kind: ${kind}`, `  name: ${toonScalar(sanitize(name))}`, `  output: ${toonScalar(truncate(sanitize(result.stdout || result.stderr), PREVIEW_LIMIT).text)}`];
  if (ttl) lines.push(`  ttl: ${ttl}s`);
  print(lines.join("\n"));
}

function dropObject(parsed, context) {
  const kind = parsed.flags.kind;
  const name = parsed.flags.name;
  if (!kind) usageError("--kind is required", ["Run `redis-axi drop --kind <key|user|group|database|all> --name <name> --confirm <name>`"]);
  if (!name) usageError("--name is required", ["Run `redis-axi drop --kind key --name <key> --confirm <key>`"]);
  const db = parsed.flags.database ?? context.database;

  const expectedConfirm = kind === "all" ? "flushall" : kind === "database" ? (db || "0") : name;
  if (parsed.flags.confirm !== expectedConfirm) {
    usageError(`destructive drop requires --confirm matching ${toonScalar(expectedConfirm)}`, [`Run \`redis-axi drop --kind ${kind} --name ${name} --confirm ${expectedConfirm} --execute\` after review`]);
  }

  const command = buildDropCommand(kind, name, db);
  if (!command) usageError(`unknown drop kind ${toonScalar(kind)}`, ["valid kinds: key, user, group, database, all"]);

  if (!parsed.flags.execute) {
    print(["drop:", "  dry_run: true", `  kind: ${kind}`, `  name: ${toonScalar(sanitize(name))}`, `  command: ${toonScalar(sanitize(command.join(" ")))}`, formatHelp([`Run \`redis-axi drop --kind ${kind} --name ${name} --confirm ${expectedConfirm} --execute\` to drop after review`])].join("\n"));
    return;
  }
  ensureTool("redis-cli", "drop");
  const result = redisCmd(command, context);
  if (result.status !== 0) runtimeError("redis drop command failed", [sanitize(result.stderr || result.stdout)]);
  print(["drop:", "  dry_run: false", `  kind: ${kind}`, `  name: ${toonScalar(sanitize(name))}`, `  output: ${toonScalar(truncate(sanitize(result.stdout || result.stderr), PREVIEW_LIMIT).text)}`].join("\n"));
}

function exportData(parsed, context) {
  const file = parsed.flags.file;
  const format = parsed.flags.format ?? "rdb";
  const db = parsed.flags.database ?? context.database ?? "0";
  if (!file) usageError("--file is required", ["Run `redis-axi export --file <path> --format rdb|resp|json`"]);
  if (!["rdb", "resp", "json"].includes(format)) usageError("unknown export format", ["valid formats: rdb, resp, json"]);

  if (format === "rdb") {
    const command = ["--rdb", file, "-n", db];
    if (!parsed.flags.execute) {
      print(["export:", "  dry_run: true", `  format: rdb`, `  file: ${toonScalar(file)}`, `  database: ${db}`, `  command: ${toonScalar(`redis-cli ${command.join(" ")}`)}`, formatHelp(["Add `--execute` to write the RDB snapshot after review"])].join("\n"));
      return;
    }
    ensureTool("redis-cli", "export");
    const result = redisCmd(command, context);
    if (result.status !== 0) runtimeError("redis export failed", [sanitize(result.stderr || result.stdout)]);
    print(["export:", "  dry_run: false", `  format: rdb`, `  file: ${toonScalar(file)}`, `  output: ${toonScalar(truncate(sanitize(result.stdout || "export complete"), PREVIEW_LIMIT).text)}`].join("\n"));
    return;
  }

  const pattern = parsed.flags.pattern ?? "*";
  print(["export:", "  dry_run: true", `  format: ${format}`, `  file: ${toonScalar(file)}`, `  pattern: ${toonScalar(pattern)}`, `  note: ${toonScalar(`${format} key export requires scripted redis-cli --scan + DUMP/GET pipeline; plan only`)}`, formatHelp([`Use redis-cli --scan --pattern '${pattern}' with DUMP commands for ${format} export`, "Add `--execute` with rdb format for a full RDB snapshot"])].join("\n"));
}

function importData(parsed, context) {
  const file = parsed.flags.file;
  const format = parsed.flags.format ?? "resp";
  const db = parsed.flags.database ?? context.database ?? "0";
  if (!file) usageError("--file is required", ["Run `redis-axi import --file <path> --confirm <db> --format resp|json`"]);
  if (parsed.flags.confirm !== db) usageError("import requires --confirm matching --database", [`Run \`redis-axi import --file ${file} --database ${db} --confirm ${db} --execute\` after review`]);
  if (!["resp", "json"].includes(format)) usageError("unknown import format", ["valid formats: resp, json"]);

  if (!fs.existsSync(path.resolve(context.cwd, file))) usageError(`file not found: ${file}`, ["Provide a valid RESP or JSON file path"]);

  if (!parsed.flags.execute) {
    print(["import:", "  dry_run: true", `  format: ${format}`, `  file: ${toonScalar(file)}`, `  database: ${db}`, formatHelp([`Run \`redis-axi import --file ${file} --database ${db} --confirm ${db} --execute\` to import after review`])].join("\n"));
    return;
  }
  ensureTool("redis-cli", "import");
  const result = redisCmd(["-n", db, "--pipe"], context, safeRead(path.resolve(context.cwd, file)));
  if (result.status !== 0) runtimeError("redis import failed", [sanitize(result.stderr || result.stdout)]);
  print(["import:", "  dry_run: false", `  file: ${toonScalar(file)}`, `  database: ${db}`, `  output: ${toonScalar(truncate(sanitize(result.stdout || "import complete"), PREVIEW_LIMIT).text)}`].join("\n"));
}

function maintenance(parsed, context) {
  const action = parsed.flags.action;
  if (!action) usageError("--action is required", ["Run `redis-axi maintenance --action <bgsave|memory-purge|slowlog-reset|expire|persist|scan-delete|flushdb|flushall>`"]);
  const db = parsed.flags.database ?? context.database ?? "0";
  const target = parsed.flags.target;

  const destructive = ["flushdb", "flushall", "scan-delete"].includes(action);
  if (destructive) {
    if (action === "scan-delete" && !target) usageError("--target is required for scan-delete", ["Run `redis-axi maintenance --action scan-delete --target <pattern> --confirm <pattern>`"]);
    const expectedConfirm = action === "flushall" ? "flushall" : action === "scan-delete" ? target : (db || "0");
    if (parsed.flags.confirm !== expectedConfirm) {
      usageError(`destructive maintenance requires --confirm matching ${toonScalar(expectedConfirm)}`, [`Run \`redis-axi maintenance --action ${action} --confirm ${expectedConfirm} --execute\` after review`]);
    }
  }

  const command = buildMaintenanceCommand(action, db, target);
  if (!command) usageError(`unknown maintenance action ${toonScalar(action)}`, ["valid actions: bgsave, memory-purge, slowlog-reset, expire, persist, scan-delete, flushdb, flushall"]);

  if (!parsed.flags.execute) {
    print(["maintenance:", "  dry_run: true", `  action: ${action}`, target ? `  target: ${toonScalar(target)}` : "", `  command: ${toonScalar(sanitize(Array.isArray(command) ? command.join(" ") : command))}`, formatHelp(["Add `--execute` to run maintenance after review"])].filter(Boolean).join("\n"));
    return;
  }
  ensureTool("redis-cli", "maintenance");
  const args = Array.isArray(command) ? command : [command];
  const result = redisCmd(args, context);
  if (result.status !== 0) runtimeError("redis maintenance failed", [sanitize(result.stderr || result.stdout)]);
  print(["maintenance:", "  dry_run: false", `  action: ${action}`, `  output: ${toonScalar(truncate(sanitize(result.stdout || result.stderr), PREVIEW_LIMIT).text)}`].join("\n"));
}

function activity(parsed, context) {
  const limit = parsePositiveInteger(parsed.flags.limit ?? "20", "--limit");
  ensureTool("redis-cli", "activity");
  const clientResult = redisCmd(["CLIENT", "LIST"], context);
  if (clientResult.status !== 0) runtimeError("redis CLIENT LIST failed", [sanitize(clientResult.stderr || clientResult.stdout)]);
  const clients = parseClientList(clientResult.stdout).slice(0, limit);

  const slowResult = redisCmd(["SLOWLOG", "GET", "5"], context);
  const slow = slowResult.status === 0 ? parseSlowlog(slowResult.stdout).slice(0, 5) : [];

  const latResult = redisCmd(["LATENCY", "LATEST"], context);
  const latency = latResult.status === 0 ? sanitize(latResult.stdout).trim() : "not available";

  const lines = [];
  if (clients.length === 0) lines.push("clients: 0 connected clients");
  else lines.push(`count: ${clients.length} clients`, formatTable("clients", clients, ["id", "addr", "db", "cmd", "age"]));

  if (slow.length > 0) lines.push(formatTable("slowlog", slow, ["id", "duration_us", "command"]));
  lines.push(`latency: ${toonScalar(truncate(latency, 200).text)}`);
  print(lines.join("\n"));
}

function stats(parsed, context) {
  const kind = parsed.flags.kind ?? "server";
  ensureTool("redis-cli", "stats");
  const db = parsed.flags.database ?? context.database;

  const sectionMap = {
    server: "server",
    memory: "memory",
    keyspace: "keyspace",
    clients: "clients",
    commands: "commandstats",
    persistence: "persistence",
    replication: "replication",
    cluster: "cluster",
    latency: "latency-stats"
  };

  if (kind === "pubsub") {
    const result = redisCmd(["PUBSUB", "NUMPAT"], context);
    const ch = redisCmd(["PUBSUB", "CHANNELS", "*"], context);
    const patterns = result.status === 0 ? result.stdout.trim() : "unknown";
    const channels = ch.status === 0 ? ch.stdout.split(/\r?\n/).filter(Boolean).length : 0;
    print(["stats:", `  kind: pubsub`, `  active_channels: ${channels}`, `  pattern_subscriptions: ${toonScalar(patterns)}`].join("\n"));
    return;
  }

  const section = sectionMap[kind];
  if (!section) usageError(`unknown stats kind ${toonScalar(kind)}`, ["valid kinds: server, memory, keyspace, clients, commands, persistence, replication, cluster, latency, pubsub"]);

  const result = redisCmd(["INFO", section], context);
  if (result.status !== 0) runtimeError(`redis INFO ${section} failed`, [sanitize(result.stderr || result.stdout)]);
  const output = sanitize(result.stdout);
  const preview = truncate(output, RESULT_LIMIT).text;
  print(["stats:", `  kind: ${kind}`, `  output: ${toonScalar(preview)}`].join("\n"));
}

function killClient(parsed, context) {
  const clientId = parsed.flags.client_id;
  if (!clientId) usageError("--client-id is required", ["Run `redis-axi kill --client-id <id> --confirm <id>`"]);
  if (parsed.flags.confirm !== clientId) usageError("kill requires --confirm matching --client-id", [`Run \`redis-axi kill --client-id ${clientId} --confirm ${clientId} --execute\` after review`]);
  const command = ["CLIENT", "KILL", "ID", clientId];
  if (!parsed.flags.execute) {
    print(["kill:", "  dry_run: true", `  client_id: ${clientId}`, `  command: ${toonScalar(command.join(" "))}`, formatHelp([`Run \`redis-axi kill --client-id ${clientId} --confirm ${clientId} --execute\` to kill after review`])].join("\n"));
    return;
  }
  ensureTool("redis-cli", "kill");
  const result = redisCmd(command, context);
  if (result.status !== 0) runtimeError("redis CLIENT KILL failed", [sanitize(result.stderr || result.stdout)]);
  print(["kill:", "  dry_run: false", `  client_id: ${clientId}`, `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`].join("\n"));
}

function hooksInstall(parsed, context) {
  const agent = parsed.flags.agent ?? "all";
  const scope = parsed.flags.scope ?? "project";
  if (!new Set(["codex", "claude", "opencode", "all"]).has(agent)) usageError(`unknown agent ${toonScalar(agent)}`, ["valid agents: codex, claude, opencode, all"]);
  if (!new Set(["user", "project"]).has(scope)) usageError(`unknown scope ${toonScalar(scope)}`, ["valid scopes: user, project"]);
  const rows = hookTargets(agent, scope, context);
  if (!parsed.flags.execute) {
    print(["hooks:", "  dry_run: true", formatTable("files", rows, ["agent", "path", "status"]), formatHelp(["Run `redis-axi hooks install --agent all --scope project --execute` to write hook files"])].join("\n"));
    return;
  }
  for (const row of rows) {
    fs.mkdirSync(path.dirname(row.absolutePath), { recursive: true });
    fs.writeFileSync(row.absolutePath, hookContent(row.agent), "utf8");
  }
  print(formatTable("files", rows.map((r) => ({ agent: r.agent, path: r.path, status: "written" })), ["agent", "path", "status"]));
}

function skillGenerate(parsed, context) {
  const output = path.resolve(context.cwd, parsed.flags.output ?? "SKILL.md");
  const content = skillContent();
  if (parsed.flags.check) {
    const actual = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
    if (actual !== content) runtimeError("generated skill is stale or missing", [`Run \`redis-axi skill generate --output ${displayPath(output, context.cwd)}\``], 1);
    print("skill: up-to-date");
    return;
  }
  fs.writeFileSync(output, content, "utf8");
  print(["skill:", `  path: ${toonScalar(displayPath(output, context.cwd))}`, "  status: written"].join("\n"));
}

// ── Redis state helpers ───────────────────────────────────────────────────────

function redisState(context) {
  if (!findExecutable("redis-cli")) return { redisCli: "missing", ready: "missing", version: "", mode: "", role: "", selectedDb: "", keys: 0, clients: 0, memory: "" };
  const ready = pingReady(context);
  if (!ready.ok) return { redisCli: "ok", ready: "error", version: "", mode: "", role: "", selectedDb: context.database || "0", keys: 0, clients: 0, memory: "" };
  const info = redisInfo(context, "all");
  return {
    redisCli: "ok",
    ready: "ok",
    version: info.redis_version ?? "",
    mode: info.redis_mode ?? "standalone",
    role: info.role ?? "",
    selectedDb: context.database || "0",
    keys: Number(info.db0_keys ?? extractDbKeys(info, context.database || "0")),
    clients: Number(info.connected_clients ?? 0),
    memory: info.used_memory_human ?? ""
  };
}

function pingReady(context) {
  const result = redisCmd(["PING"], context);
  if (result.status !== 0) return { ok: false, detail: sanitize(result.stderr || result.stdout || "connection refused") };
  return { ok: result.stdout.trim().toUpperCase() === "PONG" || result.stdout.trim() === "PONG", detail: result.stdout.trim() };
}

function redisInfo(context, section = "all") {
  const result = redisCmd(["INFO", section], context);
  if (result.status !== 0) return {};
  return parseInfoOutput(result.stdout);
}

function parseInfoOutput(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    out[key] = val;
  }
  return out;
}

function extractDbKeys(info, db) {
  const key = `db${db}`;
  const val = info[key] ?? "";
  const m = val.match(/keys=(\d+)/);
  return m ? m[1] : 0;
}

function persistenceDetail(info) {
  if (!info.redis_version) return "not available";
  const rdb = info.rdb_last_bgsave_status ?? "unknown";
  const aof = info.aof_enabled === "1" ? "aof:enabled" : "aof:disabled";
  return `rdb:${rdb}|${aof}`;
}

// ── Command builders ──────────────────────────────────────────────────────────

function buildCreateCommand(kind, name, flags, db) {
  const n = db || "0";
  const value = flags.value ?? "";
  const spec = flags.spec ? (() => { try { return JSON.parse(flags.spec); } catch { return null; } })() : null;
  const ttl = flags.ttl;

  if (kind === "string" || kind === "key") {
    const args = ["-n", n, "SET", name, value];
    if (ttl) args.push("EX", ttl);
    return args;
  }
  if (kind === "hash") {
    if (!spec) return ["-n", n, "HSET", name, "field", value || "value"];
    const pairs = Object.entries(spec).flatMap(([k, v]) => [k, String(v)]);
    return ["-n", n, "HSET", name, ...pairs];
  }
  if (kind === "list") return ["-n", n, "RPUSH", name, value || "value"];
  if (kind === "set") return ["-n", n, "SADD", name, value || "member"];
  if (kind === "zset") return ["-n", n, "ZADD", name, "0", value || "member"];
  if (kind === "stream") {
    if (!spec) return ["-n", n, "XADD", name, "*", "field", value || "value"];
    const pairs = Object.entries(spec).flatMap(([k, v]) => [k, String(v)]);
    return ["-n", n, "XADD", name, "*", ...pairs];
  }
  if (kind === "user") return ["-n", n, "ACL", "SETUSER", name, "on", "nopass", "~*", "&*", "+@all"];
  if (kind === "group") {
    const [stream, group] = name.split(":").map((s) => s.trim());
    if (!stream || !group) return null;
    return ["-n", n, "XGROUP", "CREATE", stream, group, "$", "MKSTREAM"];
  }
  return null;
}

function buildDropCommand(kind, name, db) {
  const n = db || "0";
  if (kind === "key") return ["-n", n, "DEL", name];
  if (kind === "user") return ["-n", n, "ACL", "DELUSER", name];
  if (kind === "group") {
    const [stream, group] = name.split(":").map((s) => s.trim());
    if (!stream || !group) return null;
    return ["-n", n, "XGROUP", "DESTROY", stream, group];
  }
  if (kind === "database") return ["-n", n, "FLUSHDB"];
  if (kind === "all") return ["FLUSHALL"];
  return null;
}

function buildMaintenanceCommand(action, db, target) {
  const n = db || "0";
  if (action === "bgsave") return ["BGSAVE"];
  if (action === "memory-purge") return ["MEMORY", "PURGE"];
  if (action === "slowlog-reset") return ["SLOWLOG", "RESET"];
  if (action === "expire") {
    if (!target) return null;
    return ["-n", n, "EXPIRE", target, "0"];
  }
  if (action === "persist") {
    if (!target) return null;
    return ["-n", n, "PERSIST", target];
  }
  if (action === "scan-delete") {
    if (!target) return null;
    return ["--scan", "--pattern", target, "-n", n, "--count", "100"];
  }
  if (action === "flushdb") return ["-n", n, "FLUSHDB"];
  if (action === "flushall") return ["FLUSHALL"];
  return null;
}

function readKeyValue(key, keyType, db, context, limit) {
  const n = db || "0";
  const type = (keyType || "").toLowerCase().trim();
  if (type === "string") return redisCmd(["-n", n, "GET", key], context);
  if (type === "hash") return redisCmd(["-n", n, "HGETALL", key], context);
  if (type === "list") return redisCmd(["-n", n, "LRANGE", key, "0", String(limit - 1)], context);
  if (type === "set") return redisCmd(["-n", n, "SMEMBERS", key], context);
  if (type === "zset") return redisCmd(["-n", n, "ZRANGE", key, "0", String(limit - 1), "WITHSCORES"], context);
  if (type === "stream") return redisCmd(["-n", n, "XRANGE", key, "-", "+", "COUNT", String(limit)], context);
  return redisCmd(["-n", n, "GET", key], context);
}

function getKeyType(key, context) {
  const result = redisCmd(["TYPE", key], context);
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

// ── Discovery ─────────────────────────────────────────────────────────────────

function discoverTargets(context) {
  const targets = [];
  targets.push(...customTargets(context));

  const envFiles = [".env", ".env.local", ".env.development", ".env.test"].map((n) => path.join(context.cwd, n)).filter(fs.existsSync.bind(fs));
  for (const file of envFiles) {
    const content = safeRead(file);
    if (/REDIS_URL\s*=|REDIS_URI\s*=|REDIS_HOST\s*=|UPSTASH_REDIS/i.test(content)) {
      targets.push({ id: `env:${path.basename(file)}`, type: "connection-env", path: file, detail: "Redis connection env", provider: redisProviderFromText(content), reason: "Redis environment variables found" });
    }
  }

  for (const file of findFiles(context.cwd, isComposeFile, 2)) {
    const content = safeRead(file);
    if (/redis:|image:\s*redis/i.test(content)) {
      targets.push({ id: `compose:${displayPath(file, context.cwd)}`, type: "compose-redis", path: file, detail: "Docker Compose Redis service", provider: "local", reason: "compose file references redis image or service" });
    }
  }

  for (const file of findFiles(context.cwd, isBullConfig, 3)) {
    targets.push({ id: `bull:${displayPath(file, context.cwd)}`, type: "bull-queue", path: file, detail: "Bull/BullMQ queue config", provider: "", reason: "Bull/BullMQ config references Redis" });
  }

  for (const file of findFiles(context.cwd, isSidekiqConfig, 3)) {
    targets.push({ id: `sidekiq:${displayPath(file, context.cwd)}`, type: "sidekiq-queue", path: file, detail: "Sidekiq queue config", provider: "local", reason: "Sidekiq config references Redis" });
  }

  for (const file of findFiles(context.cwd, isCeleryConfig, 3)) {
    targets.push({ id: `celery:${displayPath(file, context.cwd)}`, type: "celery-queue", path: file, detail: "Celery queue config", provider: "", reason: "Celery config references Redis broker" });
  }

  for (const file of findFiles(context.cwd, isCacheConfig, 3)) {
    const content = safeRead(file);
    const framework = cacheFramework(file, content);
    targets.push({ id: `cache:${displayPath(file, context.cwd)}`, type: `${framework}-cache`, path: file, detail: `${framework} cache config`, provider: "", reason: "framework cache config references Redis" });
  }

  for (const file of findFiles(context.cwd, isSentinelConfig, 3)) {
    targets.push({ id: `sentinel:${displayPath(file, context.cwd)}`, type: "redis-sentinel", path: file, detail: "Redis Sentinel config", provider: "sentinel", reason: "Sentinel config found" });
  }

  for (const file of findFiles(context.cwd, isClusterConfig, 3)) {
    targets.push({ id: `cluster:${displayPath(file, context.cwd)}`, type: "redis-cluster", path: file, detail: "Redis Cluster config", provider: "cluster", reason: "Cluster config found" });
  }

  targets.push(...managedHints(context));
  return dedupeTargets(targets);
}

function customTargets(context) {
  const file = path.join(context.cwd, "redis-axi.config.json");
  const config = readJson(file);
  if (!config?.targets || !Array.isArray(config.targets)) return [];
  return config.targets.map((t) => ({
    id: String(t.id),
    type: t.type ?? "custom",
    path: path.resolve(context.cwd, t.path ?? "."),
    detail: t.detail ?? "custom Redis workflow",
    provider: t.provider ?? "",
    reason: t.reason ?? "redis-axi.config.json target",
    commands: t.commands
  }));
}

function managedHints(context) {
  const hints = [];
  for (const file of findFiles(context.cwd, (f) => /\.(env|ya?ml|json|toml|tf)$/.test(f), 3)) {
    const text = `${file}\n${safeRead(file)}`;
    const provider = redisProviderFromText(text);
    if (provider && provider !== "local") {
      hints.push({ id: `managed:${provider}:${displayPath(file, context.cwd)}`, type: "managed-redis", path: file, detail: `${provider} config hint`, provider, reason: "managed Redis provider config found" });
    }
  }
  return dedupeTargets(hints);
}

function redisProviderFromText(text) {
  if (/upstash/i.test(text)) return "upstash";
  if (/redis-cloud|redislabs/i.test(text)) return "redis-cloud";
  if (/elasticache|\.cache\.amazonaws\.com/i.test(text)) return "elasticache";
  if (/azure.*cache|cache\.windows\.net/i.test(text)) return "azure-cache";
  if (/memorystore|redis\.googleapis\.com/i.test(text)) return "gcp-memorystore";
  return "";
}

function isComposeFile(file) {
  return ["compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml"].includes(path.basename(file));
}
function isBullConfig(file) {
  const base = path.basename(file);
  return /bull(mq)?/i.test(base) && /\.(js|ts|json|ya?ml)$/.test(base);
}
function isSidekiqConfig(file) {
  const base = path.basename(file);
  return /sidekiq/i.test(base) && /\.(rb|yml|yaml)$/.test(base);
}
function isCeleryConfig(file) {
  const base = path.basename(file);
  return /celery/i.test(base) && /\.(py|cfg|ini|ya?ml)$/.test(base);
}
function isCacheConfig(file) {
  const base = path.basename(file);
  return /(cache|session|queue)\.(config|rb|py|php|js|ts|ya?ml|json)$/.test(base) || base === "config/cache.php" || base === "config/session.php";
}
function isSentinelConfig(file) {
  const base = path.basename(file);
  return /sentinel/i.test(base) && /\.(conf|ya?ml|json)$/.test(base);
}
function isClusterConfig(file) {
  const base = path.basename(file);
  return /cluster/i.test(base) && /\.(conf|ya?ml|json)$/.test(base) && /redis/i.test(safeRead(file));
}
function cacheFramework(file, content) {
  if (/rails|\.rb$/.test(file) || /Rails/.test(content)) return "rails";
  if (/laravel|\.php$/.test(file) || /Laravel/.test(content)) return "laravel";
  if (/django|\.py$/.test(file) || /django/.test(content)) return "django";
  return "node";
}

// ── redis-cli runner ──────────────────────────────────────────────────────────

function redisCmd(args, context, stdin) {
  const fullArgs = [...connectionArgs(context), ...args];
  const env = { ...process.env };
  if (context.password) env.REDISCLI_AUTH = context.password;
  const opts = { cwd: context.cwd, env, encoding: "utf8", maxBuffer: 1024 * 1024 * 8 };
  if (stdin !== undefined) opts.input = stdin;
  const result = spawnSync("redis-cli", fullArgs, opts);
  if (result.error) return { status: 127, stdout: "", stderr: result.error.message };
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function connectionArgs(context) {
  const args = [];
  if (context.url) {
    args.push("-u", context.url);
  } else {
    if (context.host) args.push("-h", context.host);
    if (context.port) args.push("-p", context.port);
  }
  if (context.tls) {
    args.push("--tls");
    if (context.tlsCert) args.push("--cert", context.tlsCert);
    if (context.tlsKey) args.push("--key", context.tlsKey);
    if (context.tlsCa) args.push("--cacert", context.tlsCa);
  }
  return args;
}

function ensureTool(cmd, purpose) {
  if (!findExecutable(cmd)) runtimeError(`${cmd} is required for ${purpose}`, [`Install Redis tools and retry`]);
}

function findExecutable(name) {
  if (name.includes(path.sep)) return fs.existsSync(name) ? name : "";
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }
  return "";
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseClientList(text) {
  return String(text).split(/\r?\n/).filter(Boolean).map((line) => {
    const fields = {};
    for (const part of line.split(" ")) {
      const eq = part.indexOf("=");
      if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    return { id: fields.id ?? "", addr: sanitize(fields.addr ?? ""), db: fields.db ?? "", cmd: fields.cmd ?? "", age: fields.age ?? "" };
  });
}

function parseSlowlog(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let i = 0;
  while (i < lines.length) {
    const idLine = lines[i];
    const idMatch = idLine.match(/^\d+\)\s*\(integer\)\s*(\d+)/) || idLine.match(/^(\d+)/);
    if (idMatch) {
      const id = idMatch[1];
      const dur = (lines[i + 2] ?? "").replace(/.*\(integer\)\s*/, "").trim();
      const cmd = sanitize((lines[i + 4] ?? "").replace(/^\d+\)\s*/, "").slice(0, 60));
      rows.push({ id, duration_us: dur, command: cmd });
      i += 5;
    } else {
      i += 1;
    }
  }
  return rows;
}

function parseXinfoGroups(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let current = {};
  for (const line of lines) {
    if (/^\d+\)/.test(line) && Object.keys(current).length > 0) { rows.push(current); current = {}; }
    const m = line.match(/^"?(name|consumers|pending|last-delivered-id)"?\s*\n?\s*"?([^"]+)"?/i) ||
              line.match(/^"(name|consumers|pending|last-delivered-id)"\s*$/i);
    if (!m) {
      const kv = line.replace(/^\d+\)\s*/, "").replace(/^"/, "").replace(/"$/, "");
      if (kv) current._last = kv;
    }
  }
  if (Object.keys(current).length > 0) rows.push(current);
  return rows.length > 0 ? rows : [{ name: "", consumers: "", pending: "", last_delivered: "" }];
}

function parseRedisPairs(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^\d+\)\s*/, "").replace(/^"/, "").replace(/"$/, "")).filter(Boolean);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (!out.length || out[out.length - 1]._filled) out.push({});
    out[out.length - 1][lines[i]] = lines[i + 1];
    if (lines[i] === "runid") out[out.length - 1]._filled = true;
  }
  return out;
}

function shellSplit(cmd) {
  const parts = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";
  for (const ch of cmd) {
    if (inQuote) {
      if (ch === quoteChar) { inQuote = false; }
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      inQuote = true; quoteChar = ch;
    } else if (ch === " ") {
      if (current) { parts.push(current); current = ""; }
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// ── Sanitization ──────────────────────────────────────────────────────────────

function sanitize(value) {
  let text = String(value ?? "");
  text = text.replace(/(rediss?:\/\/)([^:\s/@]+):([^@\s]+)@/gi, "$1<redacted>:<redacted>@");
  text = text.replace(/((?:REDIS_URL|REDIS_URI|REDIS_PASSWORD|REDISCLI_AUTH|UPSTASH_REDIS_REST_TOKEN|UPSTASH_REDIS_REST_URL|TOKEN|SECRET|API_KEY|PRIVATE_KEY|PASSWORD|PASS|AUTH)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, "$1<redacted>");
  text = text.replace(/("?[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|PRIVATE_KEY|AUTH|CREDENTIAL)[A-Z0-9_]*"?\s*:\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, "$1\"<redacted>\"");
  text = text.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "<redacted-jwt>");
  text = text.replace(/-----BEGIN[^-]+PRIVATE KEY-----[\s\S]*?-----END[^-]+PRIVATE KEY-----/g, "<redacted-private-key>");
  return text.trim();
}

function sanitizeSecretField(field, value) {
  if (/(password|secret|token|api[_-]?key|private[_-]?key|auth|credential|session|cookie)/i.test(field)) return "<redacted>";
  return sanitize(value);
}

// ── Formatting ────────────────────────────────────────────────────────────────

function parseFields(value, defaults, allowed) {
  if (!value) return defaults;
  const fields = value.split(",").map((f) => f.trim()).filter(Boolean);
  const unknown = fields.find((f) => !allowed.includes(f));
  if (unknown) usageError(`unknown field ${toonScalar(unknown)}`, [`valid fields: ${allowed.join(", ")}`]);
  return fields.length > 0 ? fields : defaults;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) usageError(`${flag} must be a positive integer`, [`Provide a positive integer for ${flag}`]);
  return parsed;
}

function pick(row, fields) {
  return Object.fromEntries(fields.map((f) => [f, row[f] ?? ""]));
}

function truncate(value, limit) {
  const text = String(value ?? "");
  if (text.length <= limit) return { text, truncated: false, total: text.length };
  return { text: `${text.slice(0, limit)}... (truncated, ${text.length} chars total)`, truncated: true, total: text.length };
}

function formatTable(name, rows, fields) {
  const header = `${name}[${rows.length}]{${fields.join(",")}}:`;
  return [header, ...rows.map((row) => `  ${fields.map((f) => toonScalar(row[f])).join(",")}`)].join("\n");
}

function formatHelp(items) {
  return [`help[${items.length}]:`, ...items.map((item) => `  ${item}`)].join("\n");
}

function toonScalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  const text = String(value);
  if (text === "") return "\"\"";
  const mustQuote = /[,\[\]{}:"#\n\r\t|]|^\s|\s$/.test(text);
  if (!mustQuote) return text;
  return `"${text.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("\t", "\\t")}"`;
}

function collapseHome(filePath) {
  const home = os.homedir();
  return filePath.startsWith(home) ? `~${filePath.slice(home.length)}` : filePath;
}

function displayPath(filePath, cwd) {
  const relative = path.relative(cwd, filePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative;
  return collapseHome(filePath);
}

function connectionLabel(context) {
  if (context.url) return sanitize(context.url);
  const parts = [];
  if (context.host) parts.push(`host:${context.host}`);
  if (context.port) parts.push(`port:${context.port}`);
  if (context.database) parts.push(`db:${context.database}`);
  if (context.tls) parts.push("tls:enabled");
  return parts.join("|") || "default";
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function hookTargets(agent, scope, context) {
  const selected = agent === "all" ? ["codex", "claude", "opencode"] : [agent];
  return selected.map((item) => {
    const absolutePath = hookPath(item, scope, context);
    return { agent: item, path: displayPath(absolutePath, context.cwd), absolutePath, status: fs.existsSync(absolutePath) ? "repair" : "create" };
  });
}

function hookPath(agent, scope, context) {
  if (agent === "codex") return scope === "project" ? path.join(context.cwd, ".codex", "hooks.json") : path.join(os.homedir(), ".codex", "hooks.json");
  if (agent === "claude") return scope === "project" ? path.join(context.cwd, ".claude", "settings.json") : path.join(os.homedir(), ".claude", "settings.json");
  return scope === "project" ? path.join(context.cwd, ".opencode", "redis-axi.json") : path.join(os.homedir(), ".config", "opencode", "plugins", "redis-axi.json");
}

function hookContent(agent) {
  const command = hookCommand();
  if (agent === "codex") return `${JSON.stringify({ SessionStart: [{ command }] }, null, 2)}\n`;
  if (agent === "claude") return `${JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command }] }] } }, null, 2)}\n`;
  return `${JSON.stringify({ name: "redis-axi", command }, null, 2)}\n`;
}

function hookCommand() {
  const installed = findExecutable("redis-axi");
  if (installed && path.resolve(installed) === path.resolve(process.argv[1])) return "redis-axi";
  return `${process.execPath} ${process.argv[1]}`;
}

// ── Skill ─────────────────────────────────────────────────────────────────────

function skillContent() {
  return `---\nname: redis-axi\ndescription: Use redis-axi to discover, inspect, query, export, import, and maintain Redis databases through safe TOON CLI workflows.\n---\n\n# redis-axi\n\nUse \`redis-axi\` when a task involves Redis databases, keys, hashes, lists, sets, sorted sets, streams, pub/sub channels, ACL users, consumer groups, persistence, performance analysis, cluster topology, Sentinel configuration, local Redis, Docker Compose Redis, Bull/BullMQ queues, Sidekiq, Celery, or managed Redis connection safety checks.\n\nRun \`redis-axi\` for live context. Use \`redis-axi doctor\` before Redis work. Discover targets with \`redis-axi discover\`. Inspect before mutating: \`redis-axi inspect --kind key --name <key>\`. Mutations require \`--execute\`; destructive operations also require \`--confirm <exact-value>\`.\n`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function safeRead(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

function findFiles(root, predicate, maxDepth, depth = 0) {
  if (depth > maxDepth) return [];
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (["node_modules", ".git", "coverage"].includes(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...findFiles(full, predicate, maxDepth, depth + 1));
    else if (predicate(full)) files.push(full);
  }
  return files;
}

function dedupeTargets(targets) {
  const seen = new Set();
  return targets.filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
}

// ── Errors ────────────────────────────────────────────────────────────────────

function usageError(message, help, code = 2) {
  print([`error: ${message}`, formatHelp(help)].join("\n"));
  process.exit(code);
}

function runtimeError(message, help, code = 1) {
  print([`error: ${message}`, formatHelp(help)].join("\n"));
  process.exit(code);
}

function print(value) {
  process.stdout.write(value);
}

// ── Help ──────────────────────────────────────────────────────────────────────

function helpHome() {
  return [
    `bin: ${toonScalar(collapseHome(process.argv[1]))}`,
    `description: ${toonScalar(DESCRIPTION)}`,
    "commands[18]{name,description}:",
    "  doctor,Check Redis client tools readiness connection and provider hints",
    "  services,List Redis capability domains",
    "  discover,Detect env compose queue cache and managed Redis targets",
    "  recommend,Suggest Redis workflows for a goal",
    "  list,List databases keys types streams groups clients channels users slowlog cluster-nodes sentinels",
    "  inspect,Inspect server database key stream group client user slowlog cluster sentinel",
    "  query,Read keys or run commands; read-only by default; mutations require --execute",
    "  create,Create keys hashes lists sets zsets streams users and groups with --execute",
    "  drop,Drop keys users groups databases or all with --execute and --confirm",
    "  export,Plan or run RDB snapshot or key export",
    "  import,Plan or run RESP or JSON key import with --confirm",
    "  maintenance,Plan or run bgsave memory-purge slowlog-reset expire persist scan-delete flushdb flushall",
    "  activity,List connected clients slowlog and latency summary",
    "  stats,List server memory keyspace client command persistence replication cluster or latency stats",
    "  kill,Kill a client connection with --execute and --confirm",
    "  hooks install,Install session context hooks",
    "  skill generate,Generate installable Agent Skill guidance",
    "examples[3]:",
    "  redis-axi",
    "  redis-axi list --kind keys --pattern 'session:*' --limit 20",
    "  redis-axi inspect --kind key --name mykey"
  ].join("\n");
}

function helpDoctor() { return helpUsage("redis-axi doctor", "Check Redis client tools readiness connection and provider hints"); }
function helpServices() { return helpUsage("redis-axi services [--fields <csv>]", "List Redis capability domains"); }
function helpDiscover() { return helpUsage("redis-axi discover [--fields <csv>] [--full]", "Detect Redis project and provider targets"); }
function helpRecommend() { return helpUsage("redis-axi recommend --goal <inspect|create|query|keys|streams|pubsub|export|import|roles|performance|maintenance|cluster|cloud|local-dev>", "Suggest Redis workflow paths"); }
function helpList() { return helpUsage("redis-axi list --kind <databases|keys|types|streams|groups|clients|channels|users|slowlog|cluster-nodes|sentinels> [--pattern <glob>] [--type <type>] [--database <n>] [--limit <n>] [--fields <csv>]", "List Redis objects"); }
function helpInspect() { return helpUsage("redis-axi inspect --kind <server|database|key|stream|group|client|user|slowlog|cluster|sentinel> --name <name> [--database <n>] [--full]", "Inspect Redis objects"); }
function helpQuery() { return helpUsage("redis-axi query --key <key>|--command <cmd>|--file <path> [--database <n>] [--limit <n>] [--execute] [--full]", "Read keys or run commands with guards"); }
function helpCreate() { return helpUsage("redis-axi create --kind <key|string|hash|list|set|zset|stream|user|group> --name <name> [--value <val>] [--spec <json>] [--ttl <seconds>] [--execute]", "Create Redis keys and ACL users with --execute"); }
function helpDrop() { return helpUsage("redis-axi drop --kind <key|user|group|database|all> --name <name> --confirm <name> [--database <n>] [--execute]", "Drop Redis keys users groups or databases with guards"); }
function helpExport() { return helpUsage("redis-axi export --file <path> [--database <n>] [--pattern <glob>] [--format rdb|resp|json] [--execute]", "Plan or run Redis export"); }
function helpImport() { return helpUsage("redis-axi import --file <path> --database <n> --confirm <n> [--format resp|json] [--execute]", "Plan or run Redis import with --confirm"); }
function helpMaintenance() { return helpUsage("redis-axi maintenance --action <bgsave|memory-purge|slowlog-reset|expire|persist|scan-delete|flushdb|flushall> [--target <key-or-pattern>] [--database <n>] [--confirm <target>] [--execute]", "Plan or run Redis maintenance"); }
function helpActivity() { return helpUsage("redis-axi activity [--limit <n>]", "List connected clients slowlog and latency summary"); }
function helpStats() { return helpUsage("redis-axi stats --kind <server|memory|keyspace|clients|commands|persistence|replication|cluster|latency|pubsub> [--database <n>]", "List Redis stats by section"); }
function helpKill() { return helpUsage("redis-axi kill --client-id <id> --confirm <id> [--execute]", "Kill a Redis client connection with guards"); }
function helpHooksInstall() { return helpUsage("redis-axi hooks install [--agent codex|claude|opencode|all] [--scope user|project] [--execute]", "Install or preview session hooks"); }
function helpSkillGenerate() { return helpUsage("redis-axi skill generate [--output SKILL.md] [--check]", "Generate or verify installable Agent Skill guidance"); }

function helpUsage(usage, description) {
  return [
    `usage: ${usage}`,
    `description: ${description}`,
    "global_flags[9]{name,default,description}:",
    "  --cwd,\".\",Workspace root",
    "  --url,\"$REDIS_URL\",Redis connection URL (rediss:// for TLS)",
    "  --host,\"$REDIS_HOST\",Redis host",
    "  --port,\"$REDIS_PORT\",Redis port",
    "  --password,\"$REDIS_PASSWORD\",Redis password (never printed)",
    "  --database,\"$REDIS_DB\",Redis database index",
    "  --tls,false,Enable TLS",
    "  --tls-cert,\"$REDIS_TLS_CERT\",TLS client cert path",
    "  --tls-key,\"$REDIS_TLS_KEY\",TLS client key path",
    "  --tls-ca,\"$REDIS_TLS_CA\",TLS CA cert path",
    "  --help,false,Show this help",
    "examples[2]:",
    `  ${usage.replace(/\s?\[.*?\]/g, "").replace(/<[^>]+>/g, "example")}`,
    "  redis-axi doctor"
  ].join("\n");
}
