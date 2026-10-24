#!/bin/sh
':' //; exec node -- "$0" "$@"
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const DESCRIPTION = "Operate Elasticsearch/OpenSearch clusters through safe discover, inspect, query, index, snapshot, and restore AXI workflows";
const VERSION = "0.1.0";
const PREVIEW_LIMIT = 1200;
const RESULT_LIMIT = 1600;
const GLOBAL_VALUE_FLAGS = new Set(["--cwd", "--url", "--cloud-id", "--api-key", "--user", "--password"]);
const GLOBAL_BOOLEAN_FLAGS = new Set(["--help", "--insecure"]);

const COMMANDS = {
  home: { value: new Set(), boolean: new Set(["--help"]), help: helpHome },
  doctor: { value: new Set(), boolean: new Set(["--help"]), help: helpDoctor },
  services: { value: new Set(), boolean: new Set(["--help"]), help: helpServices },
  discover: { value: new Set(), boolean: new Set(["--help"]), help: helpDiscover },
  recommend: { value: new Set(["--goal"]), boolean: new Set(["--help"]), help: helpRecommend },
  list: { value: new Set(["--kind", "--fields"]), boolean: new Set(["--help"]), help: helpList },
  inspect: { value: new Set(["--kind", "--name"]), boolean: new Set(["--full", "--help"]), help: helpInspect },
  query: { value: new Set(["--index", "--body", "--file", "--size"]), boolean: new Set(["--full", "--help"]), help: helpQuery },
  sql: { value: new Set(["--query"]), boolean: new Set(["--full", "--help"]), help: helpSql },
  create: { value: new Set(["--kind", "--name", "--body", "--file"]), boolean: new Set(["--execute", "--help"]), help: helpCreate },
  update: { value: new Set(["--kind", "--name", "--body", "--file"]), boolean: new Set(["--execute", "--help"]), help: helpUpdate },
  delete: { value: new Set(["--kind", "--name", "--index", "--confirm"]), boolean: new Set(["--execute", "--help"]), help: helpDelete },
  "index-doc": { value: new Set(["--index", "--id", "--body", "--file"]), boolean: new Set(["--execute", "--help"]), help: helpIndexDoc },
  bulk: { value: new Set(["--file", "--index"]), boolean: new Set(["--execute", "--help"]), help: helpBulk },
  reindex: { value: new Set(["--source", "--dest", "--confirm"]), boolean: new Set(["--execute", "--help"]), help: helpReindex },
  "snapshot create": { value: new Set(["--repository", "--snapshot", "--indices"]), boolean: new Set(["--execute", "--help"]), help: helpSnapshotCreate },
  "snapshot restore": { value: new Set(["--repository", "--snapshot", "--indices", "--confirm"]), boolean: new Set(["--execute", "--help"]), help: helpSnapshotRestore },
  tasks: { value: new Set(), boolean: new Set(["--detailed", "--full", "--help"]), help: helpTasks },
  cat: { value: new Set(["--kind"]), boolean: new Set(["--help"]), help: helpCat },
  stats: { value: new Set(["--kind", "--index"]), boolean: new Set(["--full", "--help"]), help: helpStats },
  clean: { value: new Set(["--kind", "--prefix", "--older-than", "--confirm"]), boolean: new Set(["--execute", "--help"]), help: helpClean },
  "hooks install": { value: new Set(["--agent", "--scope"]), boolean: new Set(["--execute", "--help"]), help: helpHooksInstall },
  "skill generate": { value: new Set(["--output"]), boolean: new Set(["--check", "--help"]), help: helpSkillGenerate }
};

const SERVICE_DOMAINS = [
  ["connection", "endpoint URLs, cloud IDs, API keys, basic auth, TLS", ["doctor", "discover"]],
  ["cluster-health", "status, version, nodes, shards, allocation, disk watermarks", ["cat --kind health", "inspect --kind cluster", "stats --kind cluster"]],
  ["indices", "create, list, inspect, mappings, settings, aliases", ["list --kind indices", "create --kind index", "delete --kind index"]],
  ["search", "Query DSL, SQL API, capped results", ["query", "sql"]],
  ["documents", "index, bulk, reindex, guarded writes", ["index-doc", "bulk", "reindex"]],
  ["templates", "index templates, component templates", ["list --kind templates", "create --kind template"]],
  ["pipelines", "ingest pipelines and processors", ["list --kind pipelines", "create --kind pipeline"]],
  ["lifecycle", "ILM policies, rollover hints, old-index cleanup", ["list --kind ilm-policies", "clean --kind old-indices"]],
  ["snapshots", "repositories, snapshots, restores", ["snapshot create", "snapshot restore", "list --kind repositories"]],
  ["security", "users, roles, auth errors, secret redaction", ["list --kind users", "list --kind roles"]],
  ["operations", "tasks, recovery, segments, thread pools", ["tasks", "cat --kind thread-pool"]],
  ["local-dev", "Docker Compose Elasticsearch/OpenSearch services", ["discover", "doctor"]],
  ["ci-cd", "mapping validation, dry-run operations", ["doctor", "cat --kind health"]],
  ["managed-cloud", "Elastic Cloud, AWS OpenSearch, self-hosted OpenSearch", ["discover", "recommend --goal cloud"]]
];

const RECOMMENDATIONS = {
  inspect: [
    ["elasticsearch-axi doctor", "confirm connectivity and auth before drilling in"],
    ["elasticsearch-axi cat --kind health", "one-line cluster health snapshot"],
    ["elasticsearch-axi list --kind indices", "see what indices exist first"]
  ],
  query: [
    ["elasticsearch-axi query --index <index> --body '{\"query\":{\"match_all\":{}}}' --size 5", "sample a few documents before writing a real query"],
    ["elasticsearch-axi inspect --kind index --name <index>", "check the mapping so field names in your query are correct"],
    ["elasticsearch-axi sql --query \"SELECT * FROM <index> LIMIT 10\"", "use SQL syntax instead of Query DSL"]
  ],
  index: [
    ["elasticsearch-axi create --kind index --name <name> --body <file>", "define mappings/settings before ingesting"],
    ["elasticsearch-axi index-doc --index <index> --id <id> --body <file> --execute", "write a single test document"],
    ["elasticsearch-axi bulk --file <file>.ndjson --execute", "write many documents at once"]
  ],
  mapping: [
    ["elasticsearch-axi inspect --kind index --name <index>", "view current mapping before changing it"],
    ["elasticsearch-axi update --kind mapping --name <index> --body <file> --execute", "add new fields (existing field types are immutable)"]
  ],
  pipeline: [
    ["elasticsearch-axi list --kind pipelines", "see existing ingest pipelines"],
    ["elasticsearch-axi create --kind pipeline --name <name> --body <file> --execute", "define a new ingest processor chain"]
  ],
  snapshot: [
    ["elasticsearch-axi list --kind repositories", "confirm a snapshot repository is registered"],
    ["elasticsearch-axi snapshot create --repository <repo> --snapshot <name> --execute", "back up before a risky change"]
  ],
  restore: [
    ["elasticsearch-axi list --kind snapshots", "find a snapshot to restore from"],
    ["elasticsearch-axi snapshot restore --repository <repo> --snapshot <name> --confirm <name> --execute", "restore after review"]
  ],
  performance: [
    ["elasticsearch-axi cat --kind thread-pool", "check for queue rejections/backpressure"],
    ["elasticsearch-axi stats --kind indices", "look at search/index latency aggregates"]
  ],
  security: [
    ["elasticsearch-axi list --kind users", "inventory current users"],
    ["elasticsearch-axi list --kind roles", "inventory current role grants"]
  ],
  cleanup: [
    ["elasticsearch-axi clean --kind closed-indices", "preview closed indices safe to remove"],
    ["elasticsearch-axi list --kind indices --fields index,status,store_size", "find large/unused indices"]
  ],
  cloud: [
    ["elasticsearch-axi doctor", "confirm cloud-id/API-key resolution is correct"],
    ["elasticsearch-axi discover", "detect Elastic Cloud / managed hints in this repo"]
  ],
  "local-dev": [
    ["elasticsearch-axi discover", "detect docker-compose Elasticsearch/OpenSearch services in this repo"],
    ["elasticsearch-axi doctor", "confirm the local cluster is reachable"]
  ],
  ci: [
    ["elasticsearch-axi doctor", "fail fast in CI if the cluster isn't reachable"],
    ["elasticsearch-axi cat --kind health", "assert cluster health before running integration tests"]
  ]
};

function main() {
  const commandInfo = resolveCommand(process.argv.slice(2));
  const config = COMMANDS[commandInfo.command];
  if (!config) usageError(`unknown command ${toonScalar(commandInfo.command)}`, ["Run `elasticsearch-axi --help` for available commands"]);
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
    sql,
    create,
    update,
    delete: deleteObject,
    "index-doc": indexDoc,
    bulk,
    reindex,
    "snapshot create": snapshotCreate,
    "snapshot restore": snapshotRestore,
    tasks,
    cat,
    stats,
    clean,
    "hooks install": hooksInstall,
    "skill generate": skillGenerate
  };
  handlers[commandInfo.command](parsed, context);
}

function resolveCommand(args) {
  if (args.length === 0 || args[0].startsWith("--")) return { command: "home", args };
  if (["hooks", "skill", "snapshot"].includes(args[0]) && args[1] && !args[1].startsWith("--")) {
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
      if (inlineValue !== undefined) usageError(`${rawName} does not take a value`, [`Run \`elasticsearch-axi ${command} --help\` for examples`]);
      flags[flagName(rawName)] = true;
      continue;
    }
    const value = inlineValue ?? args[index + 1];
    if (value === undefined || value.startsWith("--")) usageError(`${rawName} requires a value`, [`Run \`elasticsearch-axi ${command} --help\` for examples`]);
    flags[flagName(rawName)] = value;
    if (inlineValue === undefined) index += 1;
  }
  if (positional.length > 0) usageError(`unexpected argument ${toonScalar(positional[0])} for \`${command}\``, [`Run \`elasticsearch-axi ${command} --help\` for examples`]);
  return { flags, positional };
}

function validFlags(valueFlags, booleanFlags) {
  return [...new Set([...valueFlags, ...booleanFlags])].sort().join(", ");
}

function flagName(rawName) {
  return rawName.slice(2).replaceAll("-", "_");
}

function buildContext(flags) {
  const cwd = path.resolve(flags.cwd ?? process.cwd());
  const cloudId = flags.cloud_id ?? process.env.ELASTIC_CLOUD_ID ?? "";
  let cloudEndpoint = "";
  if (cloudId) {
    const decoded = decodeCloudId(cloudId);
    if (decoded.error) usageError(`invalid --cloud-id: ${decoded.error}`, ["Cloud ID format: <name>:<base64(domain$esUuid$kibanaUuid)>"]);
    cloudEndpoint = decoded.endpoint;
  }
  const resolvedEndpoint = flags.url ?? process.env.ELASTICSEARCH_URL ?? process.env.ES_URL ?? cloudEndpoint ?? "";
  const rawEndpoint = (resolvedEndpoint || "http://localhost:9200").replace(/\/+$/, "");
  const { cleanEndpoint, basicFromUrl } = extractBasicAuthFromUrl(rawEndpoint);
  if (!/^https?:\/\//i.test(cleanEndpoint)) usageError("the endpoint must be an http:// or https:// URL", ["Pass --url https://host:9200 (other schemes such as file:// are refused)"]);
  if (flags.insecure && process.env.ELASTICSEARCH_AXI_ALLOW_INSECURE !== "1") {
    usageError("--insecure (skip TLS certificate verification) is disabled unless ELASTICSEARCH_AXI_ALLOW_INSECURE=1 is set in the environment", ["Fix the certificate chain (NODE_EXTRA_CA_CERTS does not apply to curl: use CURL_CA_BUNDLE) instead of disabling verification"]);
  }
  const apiKey = flags.api_key ?? process.env.ELASTIC_API_KEY ?? process.env.ES_API_KEY ?? "";
  const user = flags.user ?? process.env.ELASTIC_USERNAME ?? basicFromUrl.user ?? "";
  const password = flags.password ?? process.env.ELASTIC_PASSWORD ?? basicFromUrl.password ?? "";
  let authHeader = "";
  let authMode = "none";
  if (apiKey) {
    authHeader = `ApiKey ${encodeApiKey(apiKey)}`;
    authMode = "api-key";
  } else if (user) {
    authHeader = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
    authMode = "basic";
  }
  return {
    cwd,
    endpoint: cleanEndpoint,
    authHeader,
    authMode,
    insecure: Boolean(flags.insecure),
    cloudId
  };
}

function decodeCloudId(cloudId) {
  const colonIndex = cloudId.indexOf(":");
  if (colonIndex === -1) return { error: "missing ':' separator" };
  const payload = cloudId.slice(colonIndex + 1);
  let decoded;
  try {
    decoded = Buffer.from(payload, "base64").toString("utf8");
  } catch {
    return { error: "payload is not valid base64" };
  }
  const parts = decoded.split("$");
  if (parts.length < 2 || !parts[0] || !parts[1]) return { error: "decoded payload missing domain or es uuid" };
  const [domain, esUuid] = parts;
  return { endpoint: `https://${esUuid}.${domain}` };
}

function extractBasicAuthFromUrl(url) {
  const match = url.match(/^(https?:\/\/)([^:@/\s]+):([^@/\s]+)@(.+)$/);
  if (!match) return { cleanEndpoint: url, basicFromUrl: {} };
  const [, scheme, user, password, rest] = match;
  return { cleanEndpoint: `${scheme}${rest}`, basicFromUrl: { user: decodeURIComponent(user), password: decodeURIComponent(password) } };
}

function encodeApiKey(value) {
  if (value.includes(":")) return Buffer.from(value).toString("base64");
  return value;
}

function runCurl(method, urlPath, body, context, options = {}) {
  // --proto: curl also speaks file://, gopher://, dict://, ftp://, ... Only http(s) may ever be requested.
  const args = ["-s", "-S", "--proto", "=http,https", "-X", method, `${context.endpoint}${urlPath}`, "-H", `Content-Type: ${options.ndjson ? "application/x-ndjson" : "application/json"}`, "-H", "Accept: application/json", "-w", "\n%{http_code}"];
  // Credentials must not appear on the command line (visible to other local users via the process list):
  // hand the Authorization header to curl as a config file on stdin instead.
  let curlConfig;
  if (context.authHeader) {
    const header = `Authorization: ${context.authHeader}`.replace(/[\r\n]/g, "").replace(/[\\"]/g, (c) => "\\" + c);
    curlConfig = `header = "${header}"\n`;
    args.push("-K", "-");
  }
  if (context.insecure) args.push("-k");
  let tempDir = null;
  if (body !== undefined && body !== null) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "elasticsearch-axi-"));
    const tempFile = path.join(tempDir, "body.json");
    fs.writeFileSync(tempFile, options.ndjson ? String(body) : JSON.stringify(body));
    args.push("--data-binary", `@${tempFile}`);
  }
  const result = spawnSync("curl", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 32, ...(curlConfig ? { input: curlConfig } : {}) });
  if (tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
  if (result.error) return { networkError: true, message: sanitize(result.error.message) };
  if (result.status !== 0) return { networkError: true, message: sanitize(result.stderr || "curl request failed"), curlExit: result.status };
  const stdout = result.stdout ?? "";
  const idx = stdout.lastIndexOf("\n");
  const statusLine = idx === -1 ? stdout : stdout.slice(idx + 1);
  const raw = idx === -1 ? "" : stdout.slice(0, idx);
  const httpStatus = Number(statusLine.trim()) || 0;
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  return { networkError: false, httpStatus, body: parsed, raw };
}

function tryRequest(method, urlPath, body, context, options = {}) {
  if (!findExecutable("curl")) return { ok: false, curlMissing: true };
  const result = runCurl(method, urlPath, body, context, options);
  if (result.networkError) return { ok: false, networkError: true, message: result.message, curlExit: result.curlExit };
  return { ok: result.httpStatus < 400, httpStatus: result.httpStatus, body: result.body, raw: result.raw };
}

function request(method, urlPath, body, context, options = {}) {
  const result = tryRequest(method, urlPath, body, context, options);
  if (result.curlMissing) runtimeError("curl is required for elasticsearch requests", ["Install curl and retry"]);
  if (result.networkError) runtimeError(translateNetworkError(result), ["Run `elasticsearch-axi doctor` to diagnose connectivity"]);
  if (options.allowError) return result;
  if (result.httpStatus === 401) runtimeError("authentication failed (401) — check API key or user/password", ["Run `elasticsearch-axi doctor` to verify credentials"]);
  if (result.httpStatus === 403) runtimeError("authorization failed (403) — credentials valid but insufficient privileges", ["Check API key/user role privileges for this operation"]);
  if (result.httpStatus >= 400) {
    const reason = result.body?.error?.reason ?? result.body?.error?.type ?? result.raw ?? "unknown error";
    runtimeError(`elasticsearch request failed (${result.httpStatus})`, [truncate(sanitize(String(reason)), PREVIEW_LIMIT).text]);
  }
  return result;
}

function requestNdjson(urlPath, ndjsonText, context) {
  return request("POST", urlPath, ndjsonText, context, { ndjson: true });
}

function translateNetworkError(result) {
  if (result.curlExit === 60) return "TLS certificate verification failed — pass --insecure only for trusted dev clusters";
  if (result.curlExit === 6) return "could not resolve host — check --url/ELASTICSEARCH_URL";
  if (result.curlExit === 7) return "could not connect to host — cluster may be unreachable";
  if (result.curlExit === 28) return "connection timed out";
  return `elasticsearch request failed: ${result.message || "connection error"}`;
}

function home(_parsed, context) {
  const curlPath = findExecutable("curl");
  const root = curlPath ? tryRequest("GET", "/", undefined, context) : { ok: false, curlMissing: true };
  const health = curlPath && root.ok ? tryRequest("GET", "/_cluster/health", undefined, context) : { ok: false };
  const indices = curlPath && root.ok ? tryRequest("GET", "/_cat/indices?format=json", undefined, context) : { ok: false };
  const nodes = curlPath && root.ok ? tryRequest("GET", "/_cat/nodes?format=json", undefined, context) : { ok: false };
  const allocation = curlPath && root.ok ? tryRequest("GET", "/_cat/allocation?format=json", undefined, context) : { ok: false };
  const targets = discoverTargets(context);
  const hints = managedHints(context);
  const distribution = detectDistribution(root.body);
  const lines = [
    `bin: ${toonScalar(collapseHome(process.argv[1]))}`,
    `description: ${toonScalar(DESCRIPTION)}`,
    `version: ${VERSION}`,
    "cluster:",
    `  curl: ${curlPath ? "available" : "missing"}`,
    `  endpoint: ${toonScalar(sanitize(context.endpoint))}`,
    `  reachable: ${toonScalar(Boolean(root.ok))}`,
    `  cluster_name: ${toonScalar(root.body?.cluster_name ?? "")}`,
    `  es_version: ${toonScalar(root.body?.version?.number ?? "")}`,
    `  distribution: ${toonScalar(distribution)}`,
    `  health: ${toonScalar(health.body?.status ?? (root.ok ? "unknown" : "unreachable"))}`,
    `  nodes: ${toonScalar(Array.isArray(nodes.body) ? nodes.body.length : "")}`,
    `  indices: ${toonScalar(Array.isArray(indices.body) ? indices.body.length : "")}`,
    `  disk_status: ${toonScalar(diskStatus(allocation.body))}`,
    `targets_count: ${targets.length}`,
    `managed_hint: ${toonScalar(hints.map((hint) => hint.provider).join("|") || "none")}`
  ];
  if (targets.length === 0) lines.push("targets: 0 Elasticsearch/OpenSearch targets detected in this workspace");
  else lines.push(formatTable("targets", targets.slice(0, 8).map((target) => pick(target, ["name", "type", "source", "endpoint"])), ["name", "type", "source", "endpoint"]));
  const help = [];
  if (!root.ok) help.push("Run `elasticsearch-axi doctor` to diagnose connectivity");
  else help.push("Run `elasticsearch-axi list --kind indices` to see indices");
  help.push("Run `elasticsearch-axi discover` to inspect project targets");
  lines.push(formatHelp(help));
  print(lines.join("\n"));
}

function detectDistribution(body) {
  if (!body) return "unknown";
  if (body.version?.distribution === "opensearch") return "opensearch";
  if (typeof body.tagline === "string" && /You Know, for Search/i.test(body.tagline)) return "elasticsearch";
  if (body.version?.distribution) return String(body.version.distribution);
  return body.tagline ? "opensearch" : "unknown";
}

function diskStatus(body) {
  if (!Array.isArray(body) || body.length === 0) return "unknown";
  const percents = body.map((row) => Number(row["disk.percent"])).filter((num) => Number.isFinite(num));
  if (percents.length === 0) return "unknown";
  const max = Math.max(...percents);
  if (max >= 90) return "critical";
  if (max >= 80) return "warning";
  return "ok";
}

function doctor(_parsed, context) {
  const curlPath = findExecutable("curl");
  const rows = [];
  rows.push({ name: "curl", status: curlPath ? "ok" : "fail", detail: curlPath ? collapseHome(curlPath) : "install curl and retry" });
  rows.push({ name: "endpoint-config", status: "ok", detail: `${sanitize(context.endpoint)} auth:${context.authMode}` });
  if (!curlPath) {
    rows.push({ name: "cluster-reachability", status: "fail", detail: "skipped — curl missing" });
    rows.push({ name: "version-distribution", status: "fail", detail: "skipped" });
    rows.push({ name: "cluster-health", status: "fail", detail: "skipped" });
    rows.push({ name: "auth-check", status: "fail", detail: "skipped" });
    rows.push({ name: "tls-check", status: "fail", detail: "skipped" });
    rows.push({ name: "snapshot-repositories", status: "fail", detail: "skipped" });
    rows.push({ name: "cloud-hints", status: "ok", detail: managedHints(context).map((hint) => hint.provider).join("|") || "none detected" });
    print(["summary: attention-required", formatTable("checks", rows, ["name", "status", "detail"]), formatHelp(["Install curl and retry", "Run `elasticsearch-axi discover` after curl is available"])].join("\n"));
    return;
  }
  const root = tryRequest("GET", "/", undefined, context);
  if (!root.ok) {
    if (root.networkError) {
      rows.push({ name: "cluster-reachability", status: "fail", detail: translateNetworkError(root) });
      if (root.curlExit === 60) rows.push({ name: "tls-check", status: "fail", detail: "certificate verification failed — pass --insecure only for trusted dev clusters" });
      else rows.push({ name: "tls-check", status: "ok", detail: "no TLS error detected" });
    } else if (root.httpStatus === 401) {
      rows.push({ name: "cluster-reachability", status: "warn", detail: "reachable but authentication failed (401)" });
      rows.push({ name: "auth-check", status: "fail", detail: "authentication failed — check API key or user/password" });
      rows.push({ name: "tls-check", status: "ok", detail: "no TLS error detected" });
    } else if (root.httpStatus === 403) {
      rows.push({ name: "cluster-reachability", status: "warn", detail: "reachable but authorization failed (403)" });
      rows.push({ name: "auth-check", status: "fail", detail: "credentials valid but insufficient privileges" });
      rows.push({ name: "tls-check", status: "ok", detail: "no TLS error detected" });
    } else {
      rows.push({ name: "cluster-reachability", status: "fail", detail: `unexpected response (${root.httpStatus})` });
      rows.push({ name: "auth-check", status: "ok", detail: "no auth error detected" });
      rows.push({ name: "tls-check", status: "ok", detail: "no TLS error detected" });
    }
    rows.push({ name: "version-distribution", status: "fail", detail: "skipped — cluster unreachable" });
    rows.push({ name: "cluster-health", status: "fail", detail: "skipped — cluster unreachable" });
    rows.push({ name: "snapshot-repositories", status: "warn", detail: "skipped — cluster unreachable" });
  } else {
    rows.push({ name: "cluster-reachability", status: "ok", detail: `cluster_name:${root.body?.cluster_name ?? "unknown"}` });
    const distribution = detectDistribution(root.body);
    rows.push({ name: "version-distribution", status: "ok", detail: `${distribution} ${root.body?.version?.number ?? ""}`.trim() });
    const health = tryRequest("GET", "/_cluster/health", undefined, context);
    const status = health.body?.status;
    rows.push({ name: "cluster-health", status: status === "green" ? "ok" : status === "yellow" ? "warn" : "fail", detail: status ?? "unreachable" });
    rows.push({ name: "auth-check", status: "ok", detail: context.authMode === "none" ? "no auth configured" : `${context.authMode} accepted` });
    rows.push({ name: "tls-check", status: "ok", detail: context.endpoint.startsWith("https") ? "verified" : "not using TLS" });
    const repos = tryRequest("GET", "/_snapshot", undefined, context);
    const repoNames = repos.ok ? Object.keys(repos.body ?? {}) : [];
    rows.push({ name: "snapshot-repositories", status: repos.ok ? "ok" : "warn", detail: repoNames.length ? `${repoNames.length} registered` : "none registered" });
  }
  rows.push({ name: "cloud-hints", status: "ok", detail: managedHints(context).map((hint) => hint.provider).join("|") || "none detected" });
  const failed = rows.slice(0, 6).some((row) => row.status === "fail");
  print([`summary: ${failed ? "attention-required" : "ready"}`, formatTable("checks", rows, ["name", "status", "detail"]), formatHelp(["Run `elasticsearch-axi discover` to list detected targets", "Run `elasticsearch-axi services` to inspect supported domains"])].join("\n"));
}

function services() {
  const rows = SERVICE_DOMAINS.map(([domain, description, commands]) => ({ domain, description, commands: commands.join("|") }));
  print([`count: ${rows.length} Elasticsearch capability domains`, formatTable("services", rows, ["domain", "description", "commands"]), formatHelp(["Run `elasticsearch-axi recommend --goal <inspect|query|index|mapping|pipeline|snapshot|restore|performance|security|cleanup|cloud|local-dev|ci>` for workflow paths"])].join("\n"));
}

function discover(_parsed, context) {
  const targets = discoverTargets(context);
  const hints = managedHints(context);
  const fields = ["name", "type", "source", "endpoint"];
  const rows = targets.map((target) => pick(target, fields));
  const lines = [`count: ${rows.length} Elasticsearch/OpenSearch targets detected`];
  if (rows.length === 0) lines.push("targets: 0 Elasticsearch/OpenSearch targets detected in this workspace");
  else lines.push(formatTable("targets", rows, fields));
  if (hints.length === 0) lines.push("hints: 0 managed/cloud hints detected");
  else lines.push(formatTable("hints", hints.map((hint) => ({ provider: hint.provider, source: hint.source })), ["provider", "source"]));
  lines.push(formatHelp(["Run `elasticsearch-axi doctor` to check connection readiness", "Run `elasticsearch-axi recommend --goal local-dev` for next steps"]));
  print(lines.join("\n"));
}

function recommend(parsed) {
  const goal = parsed.flags.goal;
  const validGoals = Object.keys(RECOMMENDATIONS);
  if (!goal) usageError("--goal is required", [`Run \`elasticsearch-axi recommend --goal <${validGoals.join("|")}>\``]);
  const rows = RECOMMENDATIONS[goal];
  if (!rows) usageError(`unknown goal ${toonScalar(goal)}`, [`valid goals: ${validGoals.join(", ")}`]);
  print([`goal: ${goal}`, formatTable("paths", rows.map(([command, why]) => ({ command, why })), ["command", "why"]), formatHelp(["Run the suggested command for the path that best matches the task"])].join("\n"));
}

function discoverTargets(context) {
  const targets = [];
  targets.push(...customTargets(context));
  const envFiles = [".env", ".env.local", ".env.development", ".env.test"].map((name) => path.join(context.cwd, name)).filter((file) => fs.existsSync(file));
  for (const file of envFiles) {
    const env = parseEnvFile(safeRead(file));
    if (env.ELASTIC_CLOUD_ID) {
      const decoded = decodeCloudId(env.ELASTIC_CLOUD_ID);
      targets.push({ name: `env:${path.basename(file)}:cloud`, type: "env", source: displayPath(file, context.cwd), endpoint: decoded.endpoint ?? "invalid-cloud-id" });
    } else if (env.ELASTICSEARCH_URL || env.ES_URL) {
      targets.push({ name: `env:${path.basename(file)}`, type: "env", source: displayPath(file, context.cwd), endpoint: sanitize(env.ELASTICSEARCH_URL || env.ES_URL) });
    }
  }
  for (const file of findFiles(context.cwd, isComposeFile, 2)) {
    for (const service of parseEsComposeServices(file)) {
      targets.push({ name: `compose:${service.name}`, type: "compose", source: displayPath(file, context.cwd), endpoint: `http://localhost:${service.port}` });
    }
  }
  for (const dirName of ["elasticsearch", "es", path.join("config", "elasticsearch")]) {
    const dir = path.join(context.cwd, dirName);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      targets.push({ name: `local-config:${dirName}`, type: "local-config", source: displayPath(dir, context.cwd), endpoint: "" });
    }
  }
  for (const file of findFiles(context.cwd, (item) => /\.(index-template|pipeline)\.json$/.test(item), 2)) {
    targets.push({ name: `local-config:${path.basename(file)}`, type: "local-config", source: displayPath(file, context.cwd), endpoint: "" });
  }
  const packageJson = readJson(path.join(context.cwd, "package.json"));
  if (packageJson) {
    const deps = Object.keys({ ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) });
    const match = deps.find((dep) => /^@elastic\/elasticsearch$|^@opensearch-project\/opensearch$|^elasticsearch$/.test(dep));
    if (match) targets.push({ name: `dependency:${match}`, type: "dependency", source: "package.json", endpoint: "" });
  }
  for (const file of ["filebeat.yml", "metricbeat.yml", "logstash.conf", "logstash.yml", "kibana.yml"].map((name) => path.join(context.cwd, name)).filter((file) => fs.existsSync(file))) {
    const content = safeRead(file);
    const hostMatch = content.match(/hosts:\s*\[?["']?([^"'\],\s]+)/i) ?? content.match(/elasticsearch\s*\{[^}]*hosts\s*=>\s*\[["']([^"']+)/i);
    targets.push({ name: `adjacent-tool:${path.basename(file)}`, type: "adjacent-tool", source: displayPath(file, context.cwd), endpoint: hostMatch ? sanitize(hostMatch[1]) : "" });
  }
  return dedupeTargets(targets);
}

function parseEnvFile(content) {
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function customTargets(context) {
  const file = path.join(context.cwd, "elasticsearch-axi.config.json");
  const config = readJson(file);
  if (!config?.targets || !Array.isArray(config.targets)) return [];
  return config.targets.map((target) => ({
    name: String(target.name ?? target.id ?? "custom"),
    type: "config",
    source: "elasticsearch-axi.config.json",
    endpoint: sanitize(target.url ?? target.cloud_id ?? "")
  }));
}

function managedHints(context) {
  const hints = [];
  for (const file of findFiles(context.cwd, (item) => /\.(tf|toml|json|ya?ml|env)$/.test(item), 3)) {
    const text = `${file}\n${safeRead(file)}`;
    const provider = cloudProviderFromText(text);
    if (provider) hints.push({ provider, source: displayPath(file, context.cwd) });
  }
  const seen = new Set();
  return hints.filter((hint) => {
    const key = `${hint.provider}:${hint.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cloudProviderFromText(text) {
  if (/resource\s+"ec_deployment"/.test(text)) return "elastic-cloud";
  if (/resource\s+"aws_opensearch_domain"|resource\s+"aws_opensearchserverless_collection"|AWS::OpenSearchService::Domain/.test(text)) return "aws-opensearch";
  if (/ELASTIC_CLOUD_ID\s*=/.test(text)) return "elastic-cloud";
  if (/\.[a-z0-9-]+\.es\.amazonaws\.com/i.test(text)) return "aws-opensearch";
  return "";
}

function isComposeFile(file) {
  return ["compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml"].includes(path.basename(file));
}

function parseEsComposeServices(file) {
  const lines = safeRead(file).split(/\r?\n/);
  const services = [];
  let inServices = false;
  let serviceIndent = -1;
  let current = null;
  let inCurrentService = false;
  for (const line of lines) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const top = line.match(/^(\s*)services:\s*$/);
    if (top) {
      inServices = true;
      serviceIndent = -1;
      continue;
    }
    if (!inServices) continue;
    const serviceMatch = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*(?:#.*)?$/);
    if (serviceMatch) {
      const indent = serviceMatch[1].length;
      if (indent === 0 && serviceMatch[2] !== "services") break;
      if (serviceIndent === -1 && indent > 0) serviceIndent = indent;
      if (indent === serviceIndent) {
        if (current) services.push(current);
        current = { name: serviceMatch[2], image: "", port: null };
        inCurrentService = true;
        continue;
      }
    }
    if (inCurrentService && current) {
      const imageMatch = line.match(/^\s*image:\s*["']?([^"'\s#]+)/);
      if (imageMatch) current.image = imageMatch[1];
      const portMatch = line.match(/^\s*-\s*["']?(\d+):(\d+)/) ?? line.match(/^\s*-\s*["']?(\d+)["']?\s*$/);
      if (portMatch && current.port === null) current.port = Number(portMatch[1]);
    }
  }
  if (current) services.push(current);
  return services.filter((service) => /elasticsearch|opensearch/i.test(service.image)).map((service) => ({ name: service.name, port: service.port ?? 9200 }));
}

const LIST_KINDS = {
  indices: {
    method: "GET",
    path: "/_cat/indices?format=json&bytes=b",
    rows: (body) => (Array.isArray(body) ? body : []).map((row) => ({ index: row.index ?? "", health: row.health ?? "", status: row.status ?? "", docs_count: row["docs.count"] ?? "0", store_size: row["store.size"] ?? "" })),
    allFields: ["index", "health", "status", "docs_count", "store_size"],
    defaultFields: ["index", "health", "status", "docs_count"]
  },
  aliases: {
    method: "GET",
    path: "/_cat/aliases?format=json",
    rows: (body) => (Array.isArray(body) ? body : []).map((row) => ({ alias: row.alias ?? "", index: row.index ?? "", is_write_index: row.is_write_index ?? "" })),
    allFields: ["alias", "index", "is_write_index"],
    defaultFields: ["alias", "index", "is_write_index"]
  },
  templates: {
    method: "GET",
    path: "/_index_template",
    rows: (body) => (body?.index_templates ?? []).map((item) => ({ name: item.name ?? "", index_patterns: (item.index_template?.index_patterns ?? []).join("|"), priority: item.index_template?.priority ?? "" })),
    allFields: ["name", "index_patterns", "priority"],
    defaultFields: ["name", "index_patterns", "priority"]
  },
  "component-templates": {
    method: "GET",
    path: "/_component_template",
    rows: (body) => (body?.component_templates ?? []).map((item) => ({ name: item.name ?? "", version: item.component_template?.version ?? "", alias_count: Object.keys(item.component_template?.template?.aliases ?? {}).length })),
    allFields: ["name", "version", "alias_count"],
    defaultFields: ["name", "version", "alias_count"]
  },
  pipelines: {
    method: "GET",
    path: "/_ingest/pipeline",
    rows: (body) => Object.entries(body ?? {}).map(([name, item]) => ({ name, description: item.description ?? "", processor_count: (item.processors ?? []).length })),
    allFields: ["name", "description", "processor_count"],
    defaultFields: ["name", "description", "processor_count"]
  },
  snapshots: {
    method: "GET",
    path: "/_snapshot/_all/_all",
    rows: (body) => (body?.snapshots ?? []).map((item) => ({ snapshot: item.snapshot ?? "", repository: item.repository ?? "", state: item.state ?? "", start_time: item.start_time ?? "" })),
    allFields: ["snapshot", "repository", "state", "start_time"],
    defaultFields: ["snapshot", "repository", "state", "start_time"]
  },
  repositories: {
    method: "GET",
    path: "/_snapshot",
    rows: (body) => Object.entries(body ?? {}).map(([name, item]) => ({ name, type: item.type ?? "", settings_summary: truncate(JSON.stringify(item.settings ?? {}), 80).text })),
    allFields: ["name", "type", "settings_summary"],
    defaultFields: ["name", "type", "settings_summary"]
  },
  nodes: {
    method: "GET",
    path: "/_cat/nodes?format=json",
    rows: (body) => (Array.isArray(body) ? body : []).map((row) => ({ name: row.name ?? "", role: row["node.role"] ?? "", heap_percent: row["heap.percent"] ?? "", cpu: row.cpu ?? "" })),
    allFields: ["name", "role", "heap_percent", "cpu"],
    defaultFields: ["name", "role", "heap_percent", "cpu"]
  },
  shards: {
    method: "GET",
    path: "/_cat/shards?format=json",
    rows: (body) => (Array.isArray(body) ? body : []).map((row) => ({ index: row.index ?? "", shard: row.shard ?? "", prirep: row.prirep ?? "", state: row.state ?? "", node: row.node ?? "" })),
    allFields: ["index", "shard", "prirep", "state", "node"],
    defaultFields: ["index", "shard", "prirep", "state", "node"]
  },
  tasks: {
    method: "GET",
    path: "/_tasks?detailed=false",
    rows: (body) => flattenTasks(body?.nodes ?? {}),
    allFields: ["task_id", "action", "running_time", "node"],
    defaultFields: ["task_id", "action", "running_time", "node"]
  },
  "ilm-policies": {
    method: "GET",
    path: "/_ilm/policy",
    rows: (body) => Object.entries(body ?? {}).map(([name, item]) => ({ name, phases: Object.keys(item.policy?.phases ?? {}).join("|"), min_age_hot: item.policy?.phases?.hot?.min_age ?? "" })),
    allFields: ["name", "phases", "min_age_hot"],
    defaultFields: ["name", "phases", "min_age_hot"]
  },
  users: {
    method: "GET",
    path: "/_security/user",
    rows: (body) => Object.entries(body ?? {}).map(([username, item]) => ({ username, roles: (item.roles ?? []).join("|"), enabled: item.enabled ?? "" })),
    allFields: ["username", "roles", "enabled"],
    defaultFields: ["username", "roles", "enabled"],
    allowError: true,
    emptyNote: "security not enabled or no users found"
  },
  roles: {
    method: "GET",
    path: "/_security/role",
    rows: (body) => Object.entries(body ?? {}).map(([name, item]) => ({ name, cluster_privileges: (item.cluster ?? []).join("|"), indices_count: (item.indices ?? []).length })),
    allFields: ["name", "cluster_privileges", "indices_count"],
    defaultFields: ["name", "cluster_privileges", "indices_count"],
    allowError: true,
    emptyNote: "security not enabled or no roles found"
  }
};

function flattenTasks(nodes) {
  const rows = [];
  for (const [nodeId, node] of Object.entries(nodes ?? {})) {
    for (const [taskId, task] of Object.entries(node.tasks ?? {})) {
      rows.push({ task_id: taskId, action: task.action ?? "", running_time: task.running_time ?? task.running_time_in_nanos ?? "", node: node.name ?? nodeId, description: task.description ?? "" });
    }
  }
  return rows;
}

function list(parsed, context) {
  const kind = parsed.flags.kind;
  if (!kind) usageError("--kind is required", [`Run \`elasticsearch-axi list --kind <${Object.keys(LIST_KINDS).join("|")}>\``]);
  const spec = LIST_KINDS[kind];
  if (!spec) usageError(`unknown list kind ${toonScalar(kind)}`, [`valid kinds: ${Object.keys(LIST_KINDS).join(", ")}`]);
  const result = request(spec.method, spec.path, undefined, context, { allowError: Boolean(spec.allowError) });
  if (spec.allowError && result.httpStatus >= 400) {
    print(`${kind}: 0 found (${spec.emptyNote})`);
    return;
  }
  const rows = spec.rows(result.body);
  const fields = parseFields(parsed.flags.fields, spec.defaultFields, spec.allFields);
  const picked = rows.map((row) => pick(row, fields));
  if (picked.length === 0) {
    print(`${kind}: 0 found`);
    return;
  }
  print([`count: ${picked.length} ${kind}`, formatTable(kind, picked, fields)].join("\n"));
}

const INSPECT_KINDS = {
  index: (name) => `/${encodeURIComponent(name)}`,
  alias: (name) => `/_alias/${encodeURIComponent(name)}`,
  template: (name) => `/_index_template/${encodeURIComponent(name)}`,
  "component-template": (name) => `/_component_template/${encodeURIComponent(name)}`,
  pipeline: (name) => `/_ingest/pipeline/${encodeURIComponent(name)}`,
  repository: (name) => `/_snapshot/${encodeURIComponent(name)}`,
  snapshot: (name) => {
    const [repo, snap] = splitRepoSnapshot(name);
    return `/_snapshot/${encodeURIComponent(repo)}/${encodeURIComponent(snap)}`;
  },
  node: (name) => `/_nodes/${encodeURIComponent(name)}`,
  task: (name) => `/_tasks/${encodeURIComponent(name)}`,
  "ilm-policy": (name) => `/_ilm/policy/${encodeURIComponent(name)}`,
  user: (name) => `/_security/user/${encodeURIComponent(name)}`,
  role: (name) => `/_security/role/${encodeURIComponent(name)}`
};

function splitRepoSnapshot(value) {
  const parts = String(value).split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) usageError("--name must be `<repository>/<snapshot>` for snapshot kind", ["Run `elasticsearch-axi inspect --kind snapshot --name <repository>/<snapshot>`"]);
  return parts;
}

function inspect(parsed, context) {
  const kind = parsed.flags.kind;
  const name = parsed.flags.name;
  const validKinds = ["cluster", ...Object.keys(INSPECT_KINDS)];
  if (!kind) usageError("--kind is required", [`Run \`elasticsearch-axi inspect --kind <${validKinds.join("|")}> --name <name>\``]);
  if (kind !== "cluster" && !name) usageError("--name is required", [`Run \`elasticsearch-axi inspect --kind ${kind} --name <name>\``]);
  if (kind === "cluster") {
    inspectCluster(parsed, context);
    return;
  }
  const pathBuilder = INSPECT_KINDS[kind];
  if (!pathBuilder) usageError(`unknown inspect kind ${toonScalar(kind)}`, [`valid kinds: ${validKinds.join(", ")}`]);
  const result = request("GET", pathBuilder(name), undefined, context);
  let body = result.body;
  if (kind === "index") {
    const stats = tryRequest("GET", `/${encodeURIComponent(name)}/_stats`, undefined, context);
    body = { ...result.body, stats: stats.ok ? stats.body : null };
  }
  const text = JSON.stringify(sanitizeSecretJson(body));
  const truncated = truncate(text, PREVIEW_LIMIT);
  const preview = parsed.flags.full ? text : truncated.text;
  const lines = ["inspect:", `  kind: ${toonScalar(kind)}`, `  name: ${toonScalar(name)}`, `  total_size: ${text.length}`, `  output: ${toonScalar(preview)}`];
  if (!parsed.flags.full && truncated.truncated) lines.push(formatHelp([`Run \`elasticsearch-axi inspect --kind ${kind} --name ${name} --full\` for complete output`]));
  print(lines.join("\n"));
}

function inspectCluster(parsed, context) {
  const root = request("GET", "/", undefined, context);
  const health = request("GET", "/_cluster/health", undefined, context);
  const clusterStats = request("GET", "/_cluster/stats", undefined, context);
  const combined = { root: root.body, health: health.body, stats: clusterStats.body };
  const text = JSON.stringify(sanitizeSecretJson(combined));
  const truncated = truncate(text, PREVIEW_LIMIT);
  const preview = parsed.flags.full ? text : truncated.text;
  const lines = [
    "inspect:",
    "  kind: cluster",
    `  cluster_name: ${toonScalar(root.body?.cluster_name ?? "")}`,
    `  status: ${toonScalar(health.body?.status ?? "")}`,
    `  nodes: ${toonScalar(health.body?.number_of_nodes ?? "")}`,
    `  total_size: ${text.length}`,
    `  output: ${toonScalar(preview)}`
  ];
  if (!parsed.flags.full && truncated.truncated) lines.push(formatHelp(["Run `elasticsearch-axi inspect --kind cluster --full` for complete output"]));
  print(lines.join("\n"));
}

const CAT_KINDS = {
  health: { fields: ["cluster", "status", "node.total", "active_shards_percent"], display: ["cluster", "status", "node_total", "active_shards_percent"] },
  nodes: { fields: ["name", "node.role", "heap.percent", "cpu"], display: ["name", "role", "heap_percent", "cpu"] },
  indices: { fields: ["index", "health", "docs.count", "store.size"], display: ["index", "health", "docs_count", "store_size"] },
  shards: { fields: ["index", "shard", "prirep", "state"], display: ["index", "shard", "prirep", "state"] },
  allocation: { fields: ["node", "shards", "disk.percent"], display: ["node", "shards", "disk_percent"] },
  segments: { fields: ["index", "shard", "segment", "size"], display: ["index", "shard", "segment", "size"] },
  recovery: { fields: ["index", "shard", "type", "stage"], display: ["index", "shard", "type", "stage"] },
  "thread-pool": { fields: ["node_name", "name", "active", "queue"], display: ["node_name", "name", "active", "queue"] }
};

function cat(parsed, context) {
  const kind = parsed.flags.kind;
  if (!kind) usageError("--kind is required", [`Run \`elasticsearch-axi cat --kind <${Object.keys(CAT_KINDS).join("|")}>\``]);
  const spec = CAT_KINDS[kind];
  if (!spec) usageError(`unknown cat kind ${toonScalar(kind)}`, [`valid kinds: ${Object.keys(CAT_KINDS).join(", ")}`]);
  const result = request("GET", `/_cat/${kind}?format=json`, undefined, context);
  const rows = (Array.isArray(result.body) ? result.body : []).map((row) => Object.fromEntries(spec.display.map((displayField, index) => [displayField, row[spec.fields[index]] ?? ""])));
  if (rows.length === 0) {
    print(`${kind}: 0 found`);
    return;
  }
  print([`count: ${rows.length} ${kind}`, formatTable(kind, rows, spec.display)].join("\n"));
}

function stats(parsed, context) {
  const kind = parsed.flags.kind;
  if (!kind) usageError("--kind is required", ["Run `elasticsearch-axi stats --kind <cluster|nodes|indices|index>`"]);
  if (!["cluster", "nodes", "indices", "index"].includes(kind)) usageError(`unknown stats kind ${toonScalar(kind)}`, ["valid kinds: cluster, nodes, indices, index"]);
  if (kind === "index" && !parsed.flags.index) usageError("--index is required for --kind index", ["Run `elasticsearch-axi stats --kind index --index <name>`"]);
  const urlPath = kind === "cluster" ? "/_cluster/stats" : kind === "nodes" ? "/_nodes/stats" : kind === "index" ? `/${encodeURIComponent(parsed.flags.index)}/_stats` : "/_stats";
  const result = request("GET", urlPath, undefined, context);
  const summary = summarizeStats(kind, result.body);
  const lines = ["stats:", `  kind: ${kind}`, ...Object.entries(summary).map(([key, value]) => `  ${key}: ${toonScalar(value)}`)];
  const rawText = JSON.stringify(sanitizeSecretJson(result.body));
  const truncated = truncate(rawText, PREVIEW_LIMIT);
  lines.push(`  raw: ${toonScalar(parsed.flags.full ? rawText : truncated.text)}`);
  if (!parsed.flags.full && truncated.truncated) lines.push(formatHelp([`Run \`elasticsearch-axi stats --kind ${kind}${kind === "index" ? ` --index ${parsed.flags.index}` : ""} --full\` for complete raw stats`]));
  print(lines.join("\n"));
}

function summarizeStats(kind, body) {
  if (kind === "cluster") return { docs_count: body?.indices?.docs?.count ?? "", store_size: body?.indices?.store?.size_in_bytes ?? "", nodes: body?.nodes?.count?.total ?? "" };
  if (kind === "nodes") return { node_count: Object.keys(body?.nodes ?? {}).length };
  if (kind === "index") return { docs_count: body?._all?.primaries?.docs?.count ?? "", store_size: body?._all?.primaries?.store?.size_in_bytes ?? "", search_query_total: body?._all?.primaries?.search?.query_total ?? "" };
  return { docs_count: body?._all?.primaries?.docs?.count ?? "", store_size: body?._all?.primaries?.store?.size_in_bytes ?? "", index_total: body?._all?.primaries?.indexing?.index_total ?? "" };
}

function tasks(parsed, context) {
  const result = request("GET", `/_tasks?detailed=${parsed.flags.detailed ? "true" : "false"}`, undefined, context);
  const rows = flattenTasks(result.body?.nodes ?? {});
  const fields = parsed.flags.detailed ? ["task_id", "action", "running_time", "node", "description"] : ["task_id", "action", "running_time", "node"];
  let anyTruncated = false;
  const picked = rows.map((row) => {
    const out = pick(row, fields);
    if (fields.includes("description")) {
      const truncated = truncate(out.description ?? "", PREVIEW_LIMIT);
      if (truncated.truncated) anyTruncated = true;
      out.description = parsed.flags.full ? out.description : truncated.text;
    }
    return out;
  });
  if (picked.length === 0) {
    print("tasks: 0 running tasks found");
    return;
  }
  const lines = [`count: ${picked.length} tasks`, formatTable("tasks", picked, fields)];
  if (!parsed.flags.full && anyTruncated) lines.push(formatHelp(["Run `elasticsearch-axi tasks --detailed --full` for complete descriptions"]));
  print(lines.join("\n"));
}

function readBody(flags, context, options = {}) {
  if (flags.body && flags.file) usageError("--body and --file cannot be combined", ["Choose one request body source"]);
  let text = "";
  if (flags.body) text = flags.body;
  else if (flags.file) text = safeRead(path.resolve(context.cwd, flags.file));
  else if (options.required) usageError("--body or --file is required", [options.usageHint ?? "Provide --body '<json>' or --file <path>"]);
  else return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    usageError("--body/--file must contain valid JSON", ["Check the JSON syntax and retry"]);
  }
  return parsed;
}

function query(parsed, context) {
  const index = parsed.flags.index;
  if (!index) usageError("--index is required", ["Run `elasticsearch-axi query --index <name> --body '{...}'`"]);
  const body = readBody(parsed.flags, context, { required: true, usageHint: "Run `elasticsearch-axi query --index <name> --body '{\"query\":{\"match_all\":{}}}'`" });
  const size = parsePositiveInteger(parsed.flags.size ?? "10", "--size");
  const requestBody = { ...body, size: body.size ?? size };
  const result = request("POST", `/${encodeURIComponent(index)}/_search`, requestBody, context);
  const hits = result.body?.hits?.hits ?? [];
  const total = result.body?.hits?.total?.value ?? result.body?.hits?.total ?? hits.length;
  const rows = hits.map((hit) => {
    const source = sanitizeSecretJson(hit._source ?? {});
    const sourceText = JSON.stringify(source);
    const truncated = truncate(sourceText, RESULT_LIMIT);
    return { _index: hit._index ?? "", _id: hit._id ?? "", _score: hit._score ?? "", _source: parsed.flags.full ? sourceText : truncated.text };
  });
  const lines = [`total_hits: ${toonScalar(total)}`, `took_ms: ${toonScalar(result.body?.took ?? "")}`, `timed_out: ${toonScalar(Boolean(result.body?.timed_out))}`];
  if (rows.length === 0) lines.push("hits: 0 hits found");
  else lines.push(formatTable("hits", rows, ["_index", "_id", "_score", "_source"]));
  print(lines.join("\n"));
}

function sql(parsed, context) {
  const queryText = parsed.flags.query;
  if (!queryText) usageError("--query is required", ['Run `elasticsearch-axi sql --query "SELECT * FROM my-index LIMIT 10"`']);
  const result = request("POST", "/_sql?format=json", { query: queryText }, context);
  const columns = (result.body?.columns ?? []).map((col) => col.name);
  const rows = (result.body?.rows ?? []).map((row) => Object.fromEntries(columns.map((col, index) => [col, isSecretFieldName(col) ? "<redacted>" : row[index]])));
  if (rows.length === 0) {
    print("rows: 0 rows found");
    return;
  }
  const preview = parsed.flags.full ? rows : rows.map((row) => Object.fromEntries(columns.map((col) => [col, typeof row[col] === "string" ? truncate(row[col], 200).text : row[col]])));
  print([`count: ${rows.length} rows`, formatTable("rows", preview, columns)].join("\n"));
}

const CREATE_KINDS = {
  index: (name) => ({ method: "PUT", path: `/${encodeURIComponent(name)}` }),
  alias: (name, body) => ({ method: "POST", path: "/_aliases", bodyOverride: body?.actions ? body : { actions: [{ add: { index: body?.index, alias: name } }] } }),
  template: (name) => ({ method: "PUT", path: `/_index_template/${encodeURIComponent(name)}` }),
  "component-template": (name) => ({ method: "PUT", path: `/_component_template/${encodeURIComponent(name)}` }),
  pipeline: (name) => ({ method: "PUT", path: `/_ingest/pipeline/${encodeURIComponent(name)}` }),
  repository: (name) => ({ method: "PUT", path: `/_snapshot/${encodeURIComponent(name)}` }),
  "ilm-policy": (name) => ({ method: "PUT", path: `/_ilm/policy/${encodeURIComponent(name)}` })
};

function create(parsed, context) {
  const kind = parsed.flags.kind;
  const name = parsed.flags.name;
  if (!kind) usageError("--kind is required", [`Run \`elasticsearch-axi create --kind <${Object.keys(CREATE_KINDS).join("|")}> --name <name> --body <json>|--file <path>\``]);
  if (!name) usageError("--name is required", ["Run `elasticsearch-axi create --kind index --name <name> --body <json>`"]);
  const builder = CREATE_KINDS[kind];
  if (!builder) usageError(`unknown create kind ${toonScalar(kind)}`, [`valid kinds: ${Object.keys(CREATE_KINDS).join(", ")}`]);
  const body = readBody(parsed.flags, context, { required: true, usageHint: `Run \`elasticsearch-axi create --kind ${kind} --name ${name} --body '{...}'\`` });
  const spec = builder(name, body);
  const requestBody = spec.bodyOverride ?? body;
  if (!parsed.flags.execute) {
    const preview = truncate(JSON.stringify(sanitizeSecretJson(requestBody)), PREVIEW_LIMIT).text;
    print(["create:", "  dry_run: true", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  method: ${spec.method}`, `  path: ${toonScalar(spec.path)}`, `  request: ${toonScalar(preview)}`, formatHelp([`Run \`elasticsearch-axi create --kind ${kind} --name ${name} --body '<json>' --execute\` to create after review`])].join("\n"));
    return;
  }
  const result = request(spec.method, spec.path, requestBody, context);
  print(["create:", "  dry_run: false", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  result: ${toonScalar(truncate(JSON.stringify(sanitizeSecretJson(result.body)), PREVIEW_LIMIT).text)}`].join("\n"));
}

const UPDATE_KINDS = {
  mapping: (name) => ({ method: "PUT", path: `/${encodeURIComponent(name)}/_mapping` }),
  settings: (name) => ({ method: "PUT", path: `/${encodeURIComponent(name)}/_settings` }),
  pipeline: (name) => ({ method: "PUT", path: `/_ingest/pipeline/${encodeURIComponent(name)}` }),
  template: (name) => ({ method: "PUT", path: `/_index_template/${encodeURIComponent(name)}` }),
  "ilm-policy": (name) => ({ method: "PUT", path: `/_ilm/policy/${encodeURIComponent(name)}` })
};

function update(parsed, context) {
  const kind = parsed.flags.kind;
  const name = parsed.flags.name;
  if (!kind) usageError("--kind is required", [`Run \`elasticsearch-axi update --kind <${Object.keys(UPDATE_KINDS).join("|")}> --name <name> --body <json>|--file <path>\``]);
  if (!name) usageError("--name is required", ["Run `elasticsearch-axi update --kind mapping --name <index> --body <json>`"]);
  const builder = UPDATE_KINDS[kind];
  if (!builder) usageError(`unknown update kind ${toonScalar(kind)}`, [`valid kinds: ${Object.keys(UPDATE_KINDS).join(", ")}`]);
  const body = readBody(parsed.flags, context, { required: true, usageHint: `Run \`elasticsearch-axi update --kind ${kind} --name ${name} --body '{...}'\`` });
  const spec = builder(name);
  if (!parsed.flags.execute) {
    const preview = truncate(JSON.stringify(sanitizeSecretJson(body)), PREVIEW_LIMIT).text;
    print(["update:", "  dry_run: true", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  method: ${spec.method}`, `  path: ${toonScalar(spec.path)}`, `  request: ${toonScalar(preview)}`, formatHelp([`Run \`elasticsearch-axi update --kind ${kind} --name ${name} --body '<json>' --execute\` to update after review`])].join("\n"));
    return;
  }
  const result = request(spec.method, spec.path, body, context);
  print(["update:", "  dry_run: false", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  result: ${toonScalar(truncate(JSON.stringify(sanitizeSecretJson(result.body)), PREVIEW_LIMIT).text)}`].join("\n"));
}

const DELETE_KINDS = new Set(["index", "alias", "template", "component-template", "pipeline", "repository", "snapshot", "ilm-policy"]);

function deleteObject(parsed, context) {
  const kind = parsed.flags.kind;
  const name = parsed.flags.name;
  if (!kind) usageError("--kind is required", [`Run \`elasticsearch-axi delete --kind <${[...DELETE_KINDS].join("|")}> --name <name> --confirm <name>\``]);
  if (!name) usageError("--name is required", ["Run `elasticsearch-axi delete --kind index --name <name> --confirm <name>`"]);
  if (!DELETE_KINDS.has(kind)) usageError(`unknown delete kind ${toonScalar(kind)}`, [`valid kinds: ${[...DELETE_KINDS].join(", ")}`]);
  if (parsed.flags.confirm !== name) usageError("destructive delete requires --confirm matching --name", [`Run \`elasticsearch-axi delete --kind ${kind} --name ${name} --confirm ${name} --execute\` after review`]);
  if (/[*,?]/.test(name) || name === "_all") usageError("delete takes exactly one concrete name; wildcards, lists and _all are refused", ["Delete objects one by one by their exact name"]);
  const spec = deleteSpec(kind, name, parsed.flags, context);
  if (!parsed.flags.execute) {
    print(["delete:", "  dry_run: true", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, "  method: DELETE", `  path: ${toonScalar(spec.path)}`, formatHelp([`Run \`elasticsearch-axi delete --kind ${kind} --name ${name} --confirm ${name} --execute\` to delete after review`])].join("\n"));
    return;
  }
  const result = request("DELETE", spec.path, undefined, context);
  print(["delete:", "  dry_run: false", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  result: ${toonScalar(truncate(JSON.stringify(sanitizeSecretJson(result.body)), PREVIEW_LIMIT).text)}`].join("\n"));
}

function deleteSpec(kind, name, flags, context) {
  if (kind === "index") return { path: `/${encodeURIComponent(name)}` };
  if (kind === "alias") {
    const index = flags.index ?? resolveAliasIndex(name, context);
    return { path: `/${encodeURIComponent(index)}/_alias/${encodeURIComponent(name)}` };
  }
  if (kind === "template") return { path: `/_index_template/${encodeURIComponent(name)}` };
  if (kind === "component-template") return { path: `/_component_template/${encodeURIComponent(name)}` };
  if (kind === "pipeline") return { path: `/_ingest/pipeline/${encodeURIComponent(name)}` };
  if (kind === "repository") return { path: `/_snapshot/${encodeURIComponent(name)}` };
  if (kind === "snapshot") {
    const [repo, snap] = splitRepoSnapshot(name);
    return { path: `/_snapshot/${encodeURIComponent(repo)}/${encodeURIComponent(snap)}` };
  }
  return { path: `/_ilm/policy/${encodeURIComponent(name)}` };
}

function resolveAliasIndex(name, context) {
  const result = request("GET", `/_alias/${encodeURIComponent(name)}`, undefined, context);
  const indices = Object.keys(result.body ?? {});
  if (indices.length === 0) usageError(`no index found owning alias ${toonScalar(name)}`, ["Pass --index explicitly"]);
  return indices[0];
}

function indexDoc(parsed, context) {
  const index = parsed.flags.index;
  const id = parsed.flags.id;
  if (!index) usageError("--index is required", ["Run `elasticsearch-axi index-doc --index <name> --id <id> --body <json>`"]);
  if (!id) usageError("--id is required", ["Run `elasticsearch-axi index-doc --index <name> --id <id> --body <json>`"]);
  const body = readBody(parsed.flags, context, { required: true, usageHint: `Run \`elasticsearch-axi index-doc --index ${index} --id ${id} --body '{...}'\`` });
  const urlPath = `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`;
  if (!parsed.flags.execute) {
    const preview = truncate(JSON.stringify(sanitizeSecretJson(body)), PREVIEW_LIMIT).text;
    print(["index-doc:", "  dry_run: true", `  index: ${toonScalar(index)}`, `  id: ${toonScalar(id)}`, `  request: ${toonScalar(preview)}`, formatHelp([`Run \`elasticsearch-axi index-doc --index ${index} --id ${id} --body '<json>' --execute\` to write after review`])].join("\n"));
    return;
  }
  const result = request("PUT", urlPath, body, context);
  print(["index-doc:", "  dry_run: false", `  index: ${toonScalar(index)}`, `  id: ${toonScalar(id)}`, `  result: ${toonScalar(result.body?.result ?? "")}`].join("\n"));
}

function bulk(parsed, context) {
  const file = parsed.flags.file;
  if (!file) usageError("--file is required", ["Run `elasticsearch-axi bulk --file <path.ndjson>`"]);
  const content = safeRead(path.resolve(context.cwd, file));
  if (!content) usageError(`could not read --file ${toonScalar(file)}`, ["Check the file path and retry"]);
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const actionCounts = {};
  for (let i = 0; i < lines.length; i += 2) {
    try {
      const action = JSON.parse(lines[i]);
      const type = Object.keys(action)[0] ?? "unknown";
      actionCounts[type] = (actionCounts[type] ?? 0) + 1;
    } catch {
      /* malformed preview line ignored for the dry-run summary */
    }
  }
  if (!parsed.flags.execute) {
    const summary = Object.entries(actionCounts).map(([type, count]) => `${type}:${count}`).join("|") || "0 actions";
    print(["bulk:", "  dry_run: true", `  file: ${toonScalar(file)}`, `  actions: ${toonScalar(summary)}`, formatHelp([`Run \`elasticsearch-axi bulk --file ${file} --execute\` to send after review`])].join("\n"));
    return;
  }
  const ndjson = `${content.replace(/\r?\n$/, "")}\n`;
  const urlPath = parsed.flags.index ? `/${encodeURIComponent(parsed.flags.index)}/_bulk` : "/_bulk";
  const result = requestNdjson(urlPath, ndjson, context);
  const items = result.body?.items ?? [];
  const succeeded = items.filter((item) => {
    const action = Object.values(item)[0];
    return action?.status && action.status < 300;
  }).length;
  const failed = items.length - succeeded;
  const failedPreview = items.filter((item) => {
    const action = Object.values(item)[0];
    return !(action?.status && action.status < 300);
  }).slice(0, 5).map((item) => ({ preview: truncate(JSON.stringify(sanitizeSecretJson(item)), 200).text }));
  const lines2 = ["bulk:", "  dry_run: false", `  succeeded: ${succeeded}`, `  failed: ${failed}`];
  if (failedPreview.length > 0) lines2.push(formatTable("failed_items", failedPreview, ["preview"]));
  print(lines2.join("\n"));
}

function reindex(parsed, context) {
  const source = parsed.flags.source;
  const dest = parsed.flags.dest;
  if (!source) usageError("--source is required", ["Run `elasticsearch-axi reindex --source <index> --dest <index>`"]);
  if (!dest) usageError("--dest is required", ["Run `elasticsearch-axi reindex --source <index> --dest <index>`"]);
  const body = { source: { index: source }, dest: { index: dest } };
  const existing = request("HEAD", `/${encodeURIComponent(dest)}`, undefined, context, { allowError: true });
  const destExists = existing.httpStatus === 200;
  if (destExists && parsed.flags.confirm !== dest) {
    usageError("reindex into an existing destination index requires --confirm matching --dest", [`Run \`elasticsearch-axi reindex --source ${source} --dest ${dest} --confirm ${dest} --execute\` after review`]);
  }
  if (!parsed.flags.execute) {
    print(["reindex:", "  dry_run: true", `  source: ${toonScalar(source)}`, `  dest: ${toonScalar(dest)}`, `  dest_exists: ${toonScalar(destExists)}`, formatHelp([`Run \`elasticsearch-axi reindex --source ${source} --dest ${dest}${destExists ? ` --confirm ${dest}` : ""} --execute\` to reindex after review`])].join("\n"));
    return;
  }
  const result = request("POST", "/_reindex", body, context);
  print(["reindex:", "  dry_run: false", `  source: ${toonScalar(source)}`, `  dest: ${toonScalar(dest)}`, `  created: ${toonScalar(result.body?.created ?? "")}`, `  total: ${toonScalar(result.body?.total ?? "")}`].join("\n"));
}

function snapshotCreate(parsed, context) {
  const repository = parsed.flags.repository;
  const snapshot = parsed.flags.snapshot;
  if (!repository) usageError("--repository is required", ["Run `elasticsearch-axi snapshot create --repository <name> --snapshot <name>`"]);
  if (!snapshot) usageError("--snapshot is required", ["Run `elasticsearch-axi snapshot create --repository <name> --snapshot <name>`"]);
  const body = { indices: parsed.flags.indices ?? "*" };
  if (!parsed.flags.execute) {
    print(["snapshot_create:", "  dry_run: true", `  repository: ${toonScalar(repository)}`, `  snapshot: ${toonScalar(snapshot)}`, `  indices: ${toonScalar(body.indices)}`, formatHelp([`Run \`elasticsearch-axi snapshot create --repository ${repository} --snapshot ${snapshot} --execute\` to create after review`])].join("\n"));
    return;
  }
  const result = request("PUT", `/_snapshot/${encodeURIComponent(repository)}/${encodeURIComponent(snapshot)}`, body, context);
  print(["snapshot_create:", "  dry_run: false", `  repository: ${toonScalar(repository)}`, `  snapshot: ${toonScalar(snapshot)}`, `  accepted: ${toonScalar(Boolean(result.body?.accepted ?? true))}`].join("\n"));
}

function snapshotRestore(parsed, context) {
  const repository = parsed.flags.repository;
  const snapshot = parsed.flags.snapshot;
  if (!repository) usageError("--repository is required", ["Run `elasticsearch-axi snapshot restore --repository <name> --snapshot <name> --confirm <name>`"]);
  if (!snapshot) usageError("--snapshot is required", ["Run `elasticsearch-axi snapshot restore --repository <name> --snapshot <name> --confirm <name>`"]);
  if (parsed.flags.confirm !== snapshot) usageError("restore requires --confirm matching --snapshot", [`Run \`elasticsearch-axi snapshot restore --repository ${repository} --snapshot ${snapshot} --confirm ${snapshot} --execute\` after review`]);
  const body = { indices: parsed.flags.indices ?? "*" };
  if (!parsed.flags.execute) {
    print(["snapshot_restore:", "  dry_run: true", `  repository: ${toonScalar(repository)}`, `  snapshot: ${toonScalar(snapshot)}`, `  indices: ${toonScalar(body.indices)}`, formatHelp([`Run \`elasticsearch-axi snapshot restore --repository ${repository} --snapshot ${snapshot} --confirm ${snapshot} --execute\` to restore after review`])].join("\n"));
    return;
  }
  const result = request("POST", `/_snapshot/${encodeURIComponent(repository)}/${encodeURIComponent(snapshot)}/_restore`, body, context);
  print(["snapshot_restore:", "  dry_run: false", `  repository: ${toonScalar(repository)}`, `  snapshot: ${toonScalar(snapshot)}`, `  accepted: ${toonScalar(Boolean(result.body?.accepted ?? true))}`].join("\n"));
}

function clean(parsed, context) {
  const kind = parsed.flags.kind;
  if (!kind) usageError("--kind is required", ["Run `elasticsearch-axi clean --kind <closed-indices|old-indices|failed-tasks>`"]);
  if (!["closed-indices", "old-indices", "failed-tasks"].includes(kind)) usageError(`unknown clean kind ${toonScalar(kind)}`, ["valid kinds: closed-indices, old-indices, failed-tasks"]);
  const candidates = findCleanCandidates(kind, parsed.flags, context);
  const token = `${kind}:${candidates.length}`;
  if (!parsed.flags.execute) {
    const lines = ["clean:", "  dry_run: true", `  kind: ${kind}`, `  confirm_token: ${toonScalar(token)}`];
    if (candidates.length === 0) lines.push("  candidates: 0 found");
    else lines.push(formatTable("candidates", candidates.map((name) => ({ name })), ["name"]));
    lines.push(formatHelp([`Run \`elasticsearch-axi clean --kind ${kind} --confirm ${token} --execute\` to remove after review`]));
    print(lines.join("\n"));
    return;
  }
  if (parsed.flags.confirm !== token) usageError("destructive clean requires --confirm matching the dry-run confirm_token", [`Run \`elasticsearch-axi clean --kind ${kind}\` (without --execute) to see the current confirm_token`]);
  const results = candidates.map((name) => {
    if (kind === "failed-tasks") {
      const result = request("POST", `/_tasks/${encodeURIComponent(name)}/_cancel`, undefined, context, { allowError: true });
      return { name, status: result.httpStatus < 300 ? "cancelled" : "failed" };
    }
    const result = request("DELETE", `/${encodeURIComponent(name)}`, undefined, context, { allowError: true });
    return { name, status: result.httpStatus < 300 ? "deleted" : "failed" };
  });
  print(["clean:", "  dry_run: false", `  kind: ${kind}`, formatTable("results", results, ["name", "status"])].join("\n"));
}

function findCleanCandidates(kind, flags, context) {
  if (kind === "closed-indices") {
    const result = request("GET", "/_cat/indices?format=json&h=index,status", undefined, context);
    return (Array.isArray(result.body) ? result.body : []).filter((row) => row.status === "close" && (!flags.prefix || String(row.index).startsWith(flags.prefix))).map((row) => row.index);
  }
  if (kind === "old-indices") {
    const result = request("GET", "/_cat/indices?format=json&h=index,creation.date", undefined, context);
    const thresholdMs = flags.older_than ? parseDurationMs(flags.older_than) : null;
    const now = Date.now();
    return (Array.isArray(result.body) ? result.body : []).filter((row) => {
      if (flags.prefix && !String(row.index).startsWith(flags.prefix)) return false;
      if (!thresholdMs) return true;
      const created = Number(row["creation.date"]);
      return Number.isFinite(created) && now - created > thresholdMs;
    }).map((row) => row.index);
  }
  const result = request("GET", "/_tasks?detailed=true", undefined, context);
  const rows = flattenFailedTasks(result.body?.nodes ?? {});
  return rows.filter((row) => !flags.prefix || row.startsWith(flags.prefix));
}

function flattenFailedTasks(nodes) {
  const rows = [];
  for (const node of Object.values(nodes ?? {})) {
    for (const [taskId, task] of Object.entries(node.tasks ?? {})) {
      if (task.error || task.status?.failures) rows.push(taskId);
    }
  }
  return rows;
}

function parseDurationMs(value) {
  const match = String(value).match(/^(\d+)([smhd])$/);
  if (!match) usageError("--older-than must look like 30d, 12h, 45m, or 90s", ["Run `elasticsearch-axi clean --kind old-indices --older-than 30d`"]);
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return amount * multipliers[unit];
}

function hooksInstall(parsed, context) {
  const agent = parsed.flags.agent ?? "all";
  const scope = parsed.flags.scope ?? "project";
  const validAgents = new Set(["codex", "claude", "opencode", "all"]);
  const validScopes = new Set(["user", "project"]);
  if (!validAgents.has(agent)) usageError(`unknown agent ${toonScalar(agent)}`, ["valid agents: codex, claude, opencode, all"]);
  if (!validScopes.has(scope)) usageError(`unknown scope ${toonScalar(scope)}`, ["valid scopes: user, project"]);
  const rows = hookTargets(agent, scope, context);
  if (!parsed.flags.execute) {
    print(["hooks:", "  dry_run: true", formatTable("files", rows, ["agent", "path", "status"]), formatHelp(["Run `elasticsearch-axi hooks install --agent all --scope project --execute` to write hook files"])].join("\n"));
    return;
  }
  for (const row of rows) {
    fs.mkdirSync(path.dirname(row.absolutePath), { recursive: true });
    fs.writeFileSync(row.absolutePath, hookContent(row.agent), "utf8");
  }
  print(formatTable("files", rows.map((row) => ({ agent: row.agent, path: row.path, status: "written" })), ["agent", "path", "status"]));
}

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
  return scope === "project" ? path.join(context.cwd, ".opencode", "elasticsearch-axi.json") : path.join(os.homedir(), ".config", "opencode", "plugins", "elasticsearch-axi.json");
}

function hookContent(agent) {
  const command = hookCommand();
  if (agent === "codex") return `${JSON.stringify({ SessionStart: [{ command }] }, null, 2)}\n`;
  if (agent === "claude") return `${JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command }] }] } }, null, 2)}\n`;
  return `${JSON.stringify({ name: "elasticsearch-axi", command }, null, 2)}\n`;
}

function hookCommand() {
  const installed = findExecutable("elasticsearch-axi");
  if (installed && path.resolve(installed) === path.resolve(process.argv[1])) return "elasticsearch-axi";
  return `${process.execPath} ${process.argv[1]}`;
}

function skillGenerate(parsed, context) {
  const output = path.resolve(context.cwd, parsed.flags.output ?? "SKILL.md");
  const content = skillContent();
  if (parsed.flags.check) {
    const actual = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
    if (actual !== content) runtimeError("generated skill is stale or missing", [`Run \`elasticsearch-axi skill generate --output ${displayPath(output, context.cwd)}\``], 1);
    print("skill: up-to-date");
    return;
  }
  fs.writeFileSync(output, content, "utf8");
  print(["skill:", `  path: ${toonScalar(displayPath(output, context.cwd))}`, "  status: written"].join("\n"));
}

function skillContent() {
  return `---\nname: elasticsearch-axi\ndescription: Agent-facing CLI for Elasticsearch/OpenSearch clusters — inspect health, indices, mappings, and pipelines; run queries and SQL; manage snapshots — via token-efficient TOON output. Use when a user asks about Elasticsearch or OpenSearch cluster state, indices, search queries, mappings, ingest pipelines, or snapshots.\n---\n\nRun \`elasticsearch-axi\` with no arguments for live cluster status. Run \`elasticsearch-axi doctor\` first if unsure whether a cluster is reachable. Run \`elasticsearch-axi <command> --help\` for any subcommand's flags. All output is TOON-formatted (not JSON) — read the header line (\`name[count]{fields}:\`) to know the shape before parsing rows. Mutating and destructive commands default to dry-run; pass \`--execute\` (and \`--confirm <name>\` for destructive ones) only after reviewing the preview.\n`;
}

function isSecretFieldName(name) {
  return /(password|secret|token|api[_-]?key|private[_-]?key|credential|auth)/i.test(String(name ?? ""));
}

function sanitizeSecretJson(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeSecretJson(item));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = isSecretFieldName(key) ? "<redacted>" : sanitizeSecretJson(val);
    }
    return out;
  }
  if (typeof value === "string") return sanitize(value);
  return value;
}

function sanitize(value) {
  let text = String(value ?? "");
  text = text.replace(/(Authorization:\s*)(ApiKey|Basic|Bearer)(\s+)(\S+)/gi, "$1$2$3<redacted>");
  text = text.replace(/("?[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|ACCESS_KEY|PRIVATE_KEY|AUTH)[A-Z0-9_]*"?\s*:\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, "$1\"<redacted>\"");
  text = text.replace(/([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|ACCESS_KEY|PRIVATE_KEY|AUTH)[A-Z0-9_]*)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, "$1$2<redacted>");
  text = text.replace(/((?:token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|credential|auth)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, "$1<redacted>");
  text = text.replace(/(https?:\/\/)([^:\s/@]+):([^@\s]+)@/gi, "$1<redacted>:<redacted>@");
  text = text.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "<redacted-jwt>");
  text = text.replace(/\b(?:ghp|gho|ghu|ghs|glpat|sk)-[A-Za-z0-9_=-]{16,}\b/g, "<redacted-token>");
  return text.trim();
}

function pick(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? ""]));
}

function parseFields(value, defaults, allowed) {
  if (!value) return defaults;
  const fields = value.split(",").map((field) => field.trim()).filter(Boolean);
  const unknown = fields.find((field) => !allowed.includes(field));
  if (unknown) usageError(`unknown field ${toonScalar(unknown)}`, [`valid fields: ${allowed.join(", ")}`]);
  return fields.length > 0 ? fields : defaults;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) usageError(`${flag} must be a positive integer`, [`Run \`elasticsearch-axi query --size 10\``]);
  return parsed;
}

function truncate(value, limit) {
  const text = String(value ?? "");
  if (text.length <= limit) return { text, truncated: false, total: text.length };
  return { text: `${text.slice(0, limit)}... (truncated, ${text.length} chars total)`, truncated: true, total: text.length };
}

function findExecutable(name) {
  if (name.includes(path.sep)) return fs.existsSync(name) ? name : "";
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }
  return "";
}

function safeRead(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function findFiles(root, predicate, maxDepth, depth = 0) {
  if (depth > maxDepth) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
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
  return targets.filter((target) => {
    if (seen.has(target.name)) return false;
    seen.add(target.name);
    return true;
  });
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

function formatTable(name, rows, fields) {
  const header = `${name}[${rows.length}]{${fields.join(",")}}:`;
  return [header, ...rows.map((row) => `  ${fields.map((field) => toonScalar(row[field])).join(",")}`)].join("\n");
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
  const mustQuote = /[,[\]{}:"#\n\r\t|]|^\s|\s$/.test(text);
  if (!mustQuote) return text;
  return `"${text.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("\t", "\\t")}"`;
}

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

function helpHome() {
  return [
    `bin: ${toonScalar(collapseHome(process.argv[1]))}`,
    `description: ${toonScalar(DESCRIPTION)}`,
    "commands[22]{name,description}:",
    "  doctor,Check curl readiness cluster reachability auth and TLS",
    "  services,List Elasticsearch capability domains",
    "  discover,Detect env compose local-config dependency and managed cloud targets",
    "  recommend,Suggest Elasticsearch workflow paths for a goal",
    "  list,List indices aliases templates pipelines snapshots nodes shards tasks users roles",
    "  inspect,Inspect cluster index alias template pipeline repository snapshot node task or role",
    "  query,Run a Query DSL search against an index",
    "  sql,Run an ES|QL/SQL query",
    "  create,Create index alias template pipeline repository or ilm-policy with --execute",
    "  update,Update mapping settings pipeline template or ilm-policy with --execute",
    "  delete,Delete index alias template pipeline repository snapshot or ilm-policy with --execute and --confirm",
    "  index-doc,Index a single document with --execute",
    "  bulk,Send an NDJSON bulk request with --execute",
    "  reindex,Reindex from source to dest with --execute",
    "  snapshot create,Create a snapshot with --execute",
    "  snapshot restore,Restore a snapshot with --execute and --confirm",
    "  tasks,List running cluster tasks",
    "  cat,Render a _cat API view",
    "  stats,Show cluster nodes indices or index stats",
    "  clean,Remove closed-indices old-indices or failed-tasks with --execute and --confirm",
    "  hooks install,Install session context hooks",
    "  skill generate,Generate installable Agent Skill guidance",
    "examples[3]:",
    "  elasticsearch-axi",
    "  elasticsearch-axi list --kind indices",
    "  elasticsearch-axi inspect --kind index --name my-index"
  ].join("\n");
}

function helpDoctor() {
  return helpUsage("elasticsearch-axi doctor", "Check curl readiness, cluster reachability, auth, TLS, and cloud hints");
}
function helpServices() {
  return helpUsage("elasticsearch-axi services", "List Elasticsearch capability domains");
}
function helpDiscover() {
  return helpUsage("elasticsearch-axi discover", "Detect Elasticsearch/OpenSearch project and provider targets");
}
function helpRecommend() {
  return helpUsage(`elasticsearch-axi recommend --goal <${Object.keys(RECOMMENDATIONS).join("|")}>`, "Suggest Elasticsearch workflow paths");
}
function helpList() {
  return helpUsage(`elasticsearch-axi list --kind <${Object.keys(LIST_KINDS).join("|")}> [--fields <csv>]`, "List Elasticsearch/OpenSearch objects");
}
function helpInspect() {
  return helpUsage("elasticsearch-axi inspect --kind <cluster|index|alias|template|component-template|pipeline|repository|snapshot|node|task|ilm-policy|user|role> --name <name> [--full]", "Inspect an Elasticsearch/OpenSearch object");
}
function helpQuery() {
  return helpUsage('elasticsearch-axi query --index <name> --body <json>|--file <path> [--size <n>] [--full]', "Run a Query DSL search (read-only, runs immediately)");
}
function helpSql() {
  return helpUsage('elasticsearch-axi sql --query "<sql>" [--full]', "Run an ES|QL/SQL query");
}
function helpCreate() {
  return helpUsage(`elasticsearch-axi create --kind <${Object.keys(CREATE_KINDS).join("|")}> --name <name> --body <json>|--file <path> [--execute]`, "Create an Elasticsearch/OpenSearch object");
}
function helpUpdate() {
  return helpUsage(`elasticsearch-axi update --kind <${Object.keys(UPDATE_KINDS).join("|")}> --name <name> --body <json>|--file <path> [--execute]`, "Update an Elasticsearch/OpenSearch object");
}
function helpDelete() {
  return helpUsage(`elasticsearch-axi delete --kind <${[...DELETE_KINDS].join("|")}> --name <name> --confirm <name> [--execute]`, "Delete an Elasticsearch/OpenSearch object with destructive guards");
}
function helpIndexDoc() {
  return helpUsage("elasticsearch-axi index-doc --index <name> --id <id> --body <json>|--file <path> [--execute]", "Index a single document");
}
function helpBulk() {
  return helpUsage("elasticsearch-axi bulk --file <path.ndjson> [--index <name>] [--execute]", "Send an NDJSON bulk request");
}
function helpReindex() {
  return helpUsage("elasticsearch-axi reindex --source <index> --dest <index> [--confirm <dest>] [--execute]", "Reindex documents from source to dest");
}
function helpSnapshotCreate() {
  return helpUsage("elasticsearch-axi snapshot create --repository <name> --snapshot <name> [--indices <csv>] [--execute]", "Create a snapshot");
}
function helpSnapshotRestore() {
  return helpUsage("elasticsearch-axi snapshot restore --repository <name> --snapshot <name> [--indices <csv>] --confirm <name> [--execute]", "Restore a snapshot with destructive guards");
}
function helpTasks() {
  return helpUsage("elasticsearch-axi tasks [--detailed] [--full]", "List running cluster tasks");
}
function helpCat() {
  return helpUsage(`elasticsearch-axi cat --kind <${Object.keys(CAT_KINDS).join("|")}>`, "Render a _cat API view");
}
function helpStats() {
  return helpUsage("elasticsearch-axi stats --kind <cluster|nodes|indices|index> [--index <name>] [--full]", "Show cluster nodes indices or index stats");
}
function helpClean() {
  return helpUsage("elasticsearch-axi clean --kind <closed-indices|old-indices|failed-tasks> [--prefix <prefix>] [--older-than <duration>] --confirm <token> [--execute]", "Remove closed old or failed cluster objects");
}
function helpHooksInstall() {
  return helpUsage("elasticsearch-axi hooks install [--agent codex|claude|opencode|all] [--scope user|project] [--execute]", "Install or preview session hooks");
}
function helpSkillGenerate() {
  return helpUsage("elasticsearch-axi skill generate [--output SKILL.md] [--check]", "Generate or verify installable Agent Skill guidance");
}

function helpUsage(usage, description) {
  return [
    `usage: ${usage}`,
    `description: ${description}`,
    "global_flags[8]{name,default,description}:",
    "  --cwd,\".\",Workspace root",
    "  --url,\"$ELASTICSEARCH_URL\",Elasticsearch/OpenSearch endpoint URL",
    "  --cloud-id,\"$ELASTIC_CLOUD_ID\",Elastic Cloud ID (decoded to an endpoint)",
    "  --api-key,\"$ELASTIC_API_KEY\",API key sent as Authorization: ApiKey",
    "  --user,\"$ELASTIC_USERNAME\",Basic auth username",
    "  --password,\"$ELASTIC_PASSWORD\",Basic auth password",
    "  --insecure,false,Skip TLS certificate verification",
    "  --help,false,Show this help",
    "examples[2]:",
    `  ${usage.replace(/\s?\[.*?\]/g, "").replace(/<[^>]+>/g, "example")}`,
    "  elasticsearch-axi doctor"
  ].join("\n");
}

main();
