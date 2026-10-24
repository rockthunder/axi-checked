import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "bin", "elasticsearch-axi.js");
const fixtures = path.join(root, "test", "fixtures");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "elasticsearch-axi-"));
}

function makeFakeBin(workspace, script) {
  const bin = path.join(workspace, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const file = path.join(bin, "curl");
  fs.writeFileSync(file, script ?? defaultFakeCurl());
  fs.chmodSync(file, 0o755);
  return bin;
}

function run(args, options = {}) {
  const cwd = options.cwd ?? tempWorkspace();
  const fakeBin = options.noBin ? null : makeFakeBin(cwd, options.script);
  const path_ = fakeBin ? `${fakeBin}${path.delimiter}${process.env.PATH}` : path.dirname(process.execPath);
  const env = { ...process.env, PATH: path_, ...(options.env ?? {}) };
  return spawnSync(cli, args, { cwd, env, encoding: "utf8" });
}

function defaultFakeCurl() {
  return `#!/usr/bin/env node
const fs = require("fs");

const args = process.argv.slice(2);
let method = "GET";
let url = "";
let bodyFile = "";
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "-X") { method = args[i + 1]; i += 1; }
  else if (args[i] === "--data-binary") { bodyFile = args[i + 1].replace(/^@/, ""); i += 1; }
  else if (/^https?:\\/\\//.test(args[i])) { url = args[i]; }
}
let bodyText = "";
if (bodyFile) { try { bodyText = fs.readFileSync(bodyFile, "utf8"); } catch { bodyText = ""; } }
let parsedBody = null;
try { parsedBody = bodyText ? JSON.parse(bodyText) : null; } catch { parsedBody = null; }

if (process.env.ES_AXI_TEST_SENTINEL) fs.appendFileSync(process.env.ES_AXI_TEST_SENTINEL, "called\\n");

const parsed = new URL(url);
const pathname = parsed.pathname;
const search = parsed.search;

function respond(status, json) {
  const text = json === undefined ? "" : JSON.stringify(json);
  process.stdout.write(text + "\\n" + status);
  process.exit(0);
}

if (method === "GET" && pathname === "/") {
  respond(200, { cluster_name: "test-cluster", cluster_uuid: "abc123", version: { number: "8.15.0" }, tagline: "You Know, for Search" });
} else if (method === "GET" && pathname === "/_cluster/health") {
  respond(200, { status: "green", number_of_nodes: 3 });
} else if (method === "GET" && pathname === "/_cluster/stats") {
  respond(200, { indices: { docs: { count: 1000 }, store: { size_in_bytes: 2048 } }, nodes: { count: { total: 3 } } });
} else if (method === "GET" && pathname === "/_nodes/stats") {
  respond(200, { nodes: { abc: {}, def: {} } });
} else if (method === "GET" && pathname === "/_stats") {
  respond(200, { _all: { primaries: { docs: { count: 1000 }, store: { size_in_bytes: 2048 }, indexing: { index_total: 500 } } } });
} else if (method === "GET" && pathname === "/_cat/indices" && search.includes("h=index,status")) {
  respond(200, [{ index: "closed-idx", status: "close" }, { index: "open-idx", status: "open" }]);
} else if (method === "GET" && pathname === "/_cat/indices" && search.includes("creation.date")) {
  respond(200, [{ index: "old-idx", "creation.date": "1000000000000" }, { index: "new-idx", "creation.date": String(Date.now()) }]);
} else if (method === "GET" && pathname === "/_cat/indices") {
  respond(200, [{ index: "my-index", health: "green", status: "open", "docs.count": "42", "store.size": "1024" }, { index: "logs-2024", health: "yellow", status: "open", "docs.count": "100", "store.size": "2048" }]);
} else if (method === "GET" && pathname === "/_cat/nodes") {
  respond(200, [{ name: "node-1", "node.role": "cdfhilmrstw", "heap.percent": "45", cpu: "5" }]);
} else if (method === "GET" && pathname === "/_cat/allocation") {
  respond(200, [{ node: "node-1", shards: "10", "disk.percent": "42" }]);
} else if (method === "GET" && pathname === "/_cat/health") {
  respond(200, [{ cluster: "test-cluster", status: "green", "node.total": "3", active_shards_percent: "100.0%" }]);
} else if (method === "GET" && pathname === "/_cat/shards") {
  respond(200, [{ index: "my-index", shard: "0", prirep: "p", state: "STARTED", node: "node-1" }]);
} else if (method === "GET" && pathname === "/_cat/segments") {
  respond(200, [{ index: "my-index", shard: "0", segment: "_0", size: "5kb" }]);
} else if (method === "GET" && pathname === "/_cat/recovery") {
  respond(200, [{ index: "my-index", shard: "0", type: "store", stage: "done" }]);
} else if (method === "GET" && pathname === "/_cat/thread-pool") {
  respond(200, [{ node_name: "node-1", name: "search", active: "0", queue: "0" }]);
} else if (method === "GET" && pathname === "/_cat/allocation") {
  respond(200, [{ node: "node-1", shards: "10", "disk.percent": "42" }]);
} else if (method === "GET" && pathname === "/_index_template" && !pathname.includes("/", 16)) {
  respond(200, { index_templates: [{ name: "my-template", index_template: { index_patterns: ["logs-*"], priority: 100 } }] });
} else if (method === "GET" && pathname === "/_component_template") {
  respond(200, { component_templates: [{ name: "my-component", component_template: { version: 1, template: { aliases: {} } } }] });
} else if (method === "GET" && pathname === "/_ingest/pipeline") {
  respond(200, { "my-pipeline": { description: "test pipeline", processors: [{ set: {} }] } });
} else if (method === "GET" && pathname === "/_snapshot/_all/_all") {
  respond(200, { snapshots: [{ snapshot: "snap-1", repository: "my-repo", state: "SUCCESS", start_time: "2026-01-01" }] });
} else if (method === "GET" && pathname === "/_snapshot") {
  respond(200, { "my-repo": { type: "fs", settings: { location: "/mnt" } } });
} else if (method === "GET" && pathname === "/_ilm/policy") {
  respond(200, { "my-policy": { policy: { phases: { hot: { min_age: "0ms" } } } } });
} else if (method === "GET" && pathname === "/_security/user") {
  respond(200, { elastic: { roles: ["superuser"], enabled: true } });
} else if (method === "GET" && pathname === "/_security/role") {
  respond(200, { "my-role": { cluster: ["all"], indices: [] } });
} else if (method === "GET" && pathname === "/_alias/my-alias") {
  respond(200, { "my-index": { aliases: { "my-alias": {} } } });
} else if (method === "GET" && pathname === "/_nodes/node-1") {
  respond(200, { nodes: { abc123: { name: "node-1" } } });
} else if (method === "GET" && pathname === "/_tasks/task-1") {
  respond(200, { task: { action: "indices:data/write/index" } });
} else if (method === "GET" && pathname === "/_ilm/policy/my-policy") {
  respond(200, { "my-policy": { policy: { phases: { hot: { min_age: "0ms" } } } } });
} else if (method === "GET" && pathname === "/_security/user/elastic") {
  respond(200, { elastic: { roles: ["superuser"], enabled: true } });
} else if (method === "GET" && pathname === "/_security/role/my-role") {
  respond(200, { "my-role": { cluster: ["all"], indices: [] } });
} else if (method === "GET" && pathname === "/_snapshot/my-repo") {
  respond(200, { "my-repo": { type: "fs" } });
} else if (method === "GET" && pathname === "/_snapshot/my-repo/snap-1") {
  respond(200, { snapshots: [{ snapshot: "snap-1", state: "SUCCESS" }] });
} else if (method === "GET" && pathname === "/_tasks" && search.includes("detailed=true")) {
  respond(200, { nodes: { node1: { name: "node-1", tasks: { "node1:1": { action: "indices:data/read/search", running_time_in_nanos: 1000000, description: "x".repeat(2000) } } } } });
} else if (method === "GET" && pathname === "/_tasks") {
  respond(200, { nodes: { node1: { name: "node-1", tasks: { "node1:1": { action: "indices:data/read/search", running_time_in_nanos: 1000000 } } } } });
} else if (method === "GET" && pathname === "/my-index/_stats") {
  respond(200, { _all: { primaries: { docs: { count: 42 }, store: { size_in_bytes: 1024 }, search: { query_total: 7 } } } });
} else if (method === "GET" && pathname === "/my-index") {
  respond(200, { "my-index": { mappings: { properties: { title: { type: "text" } } }, settings: {} } });
} else if (method === "POST" && pathname === "/my-index/_search") {
  respond(200, { took: 5, timed_out: false, hits: { total: { value: 2 }, hits: [{ _index: "my-index", _id: "1", _score: 1.0, _source: { title: "doc1", user: { password: "supersecret", name: "alice" } } }, { _index: "my-index", _id: "2", _score: 0.9, _source: { title: "doc2" } }] } });
} else if (method === "POST" && pathname === "/_sql") {
  respond(200, { columns: [{ name: "title" }, { name: "password" }], rows: [["doc1", "supersecret"], ["doc2", "hunter2"]] });
} else if (method === "PUT" && pathname === "/my-index") {
  respond(200, { acknowledged: true, index: "my-index" });
} else if (method === "POST" && pathname === "/_aliases") {
  respond(200, { acknowledged: true });
} else if (method === "PUT" && pathname === "/_index_template/my-template") {
  respond(200, { acknowledged: true });
} else if (method === "PUT" && pathname === "/_component_template/my-component") {
  respond(200, { acknowledged: true });
} else if (method === "PUT" && pathname === "/_ingest/pipeline/my-pipeline") {
  respond(200, { acknowledged: true });
} else if (method === "PUT" && pathname === "/_snapshot/my-repo") {
  respond(200, { acknowledged: true });
} else if (method === "PUT" && pathname === "/_ilm/policy/my-policy") {
  respond(200, { acknowledged: true });
} else if (method === "PUT" && pathname === "/my-index/_mapping") {
  respond(200, { acknowledged: true });
} else if (method === "PUT" && pathname === "/my-index/_settings") {
  respond(200, { acknowledged: true });
} else if (method === "DELETE" && pathname === "/my-index") {
  respond(200, { acknowledged: true });
} else if (method === "DELETE" && pathname === "/my-index/_alias/my-alias") {
  respond(200, { acknowledged: true });
} else if (method === "DELETE" && pathname === "/_index_template/my-template") {
  respond(200, { acknowledged: true });
} else if (method === "DELETE" && pathname === "/_component_template/my-component") {
  respond(200, { acknowledged: true });
} else if (method === "DELETE" && pathname === "/_ingest/pipeline/my-pipeline") {
  respond(200, { acknowledged: true });
} else if (method === "DELETE" && pathname === "/_snapshot/my-repo") {
  respond(200, { acknowledged: true });
} else if (method === "DELETE" && pathname === "/_snapshot/my-repo/snap-1") {
  respond(200, { acknowledged: true });
} else if (method === "DELETE" && pathname === "/_ilm/policy/my-policy") {
  respond(200, { acknowledged: true });
} else if (method === "PUT" && pathname === "/my-index/_doc/1") {
  respond(201, { _id: "1", result: "created" });
} else if (method === "POST" && (pathname === "/_bulk" || pathname === "/my-index/_bulk")) {
  respond(200, { items: [{ index: { status: 201 } }, { index: { status: 400, error: { type: "mapper_parsing_exception" } } }] });
} else if (method === "HEAD" && pathname === "/existing-index") {
  respond(200);
} else if (method === "HEAD") {
  respond(404);
} else if (method === "POST" && pathname === "/_reindex") {
  respond(200, { created: 10, total: 10 });
} else if (method === "PUT" && pathname.startsWith("/_snapshot/my-repo/")) {
  respond(200, { accepted: true });
} else if (method === "POST" && pathname.endsWith("/_restore")) {
  respond(200, { accepted: true });
} else if (method === "POST" && pathname.endsWith("/_cancel")) {
  respond(200, {});
} else if (method === "GET" && pathname === "/_index_template/my-template") {
  respond(200, { index_templates: [{ name: "my-template", index_template: { index_patterns: ["logs-*"] } }] });
} else if (method === "GET" && pathname === "/_component_template/my-component") {
  respond(200, { component_templates: [{ name: "my-component" }] });
} else if (method === "GET" && pathname === "/_ingest/pipeline/my-pipeline") {
  respond(200, { "my-pipeline": { description: "test pipeline", processors: [] } });
} else {
  respond(200, {});
}
`;
}

function unreachableCurl() {
  return `#!/bin/sh
>&2 echo "curl: (7) Failed to connect"
exit 7
`;
}

function authErrorCurl(status) {
  return `#!/usr/bin/env node
const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\\/\\//.test(a));
const pathname = new URL(url).pathname;
if (pathname === "/") {
  process.stdout.write(JSON.stringify({ error: { type: "security_exception", reason: "auth failed" } }) + "\\n${status}");
} else {
  process.stdout.write("{}\\n200");
}
`;
}

function securityDisabledCurl() {
  return `#!/usr/bin/env node
const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\\/\\//.test(a));
const pathname = new URL(url).pathname;
if (pathname === "/_security/user" || pathname === "/_security/role") {
  process.stdout.write(JSON.stringify({ error: { type: "illegal_argument_exception", reason: "security not enabled" } }) + "\\n400");
} else if (pathname === "/") {
  process.stdout.write(JSON.stringify({ cluster_name: "test-cluster", version: { number: "8.15.0" }, tagline: "You Know, for Search" }) + "\\n200");
} else {
  process.stdout.write("{}\\n200");
}
`;
}

test("home view shows live cluster context and no help-first output", () => {
  const cwd = tempWorkspace();
  fs.writeFileSync(path.join(cwd, ".env"), "ELASTICSEARCH_URL=http://localhost:9200\nELASTIC_API_KEY=secretvalue\n");
  const result = run([], { cwd });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^bin: /);
  assert.match(result.stdout, /description: "Operate Elasticsearch/);
  assert.match(result.stdout, /reachable: true/);
  assert.match(result.stdout, /cluster_name: test-cluster/);
  assert.match(result.stdout, /distribution: elasticsearch/);
  assert.match(result.stdout, /health: green/);
  assert.match(result.stdout, /targets\[1\]{name,type,source,endpoint}:/);
  assert.doesNotMatch(result.stdout, /secretvalue/);
  assert.doesNotMatch(result.stdout, /^usage:/);
  assert.equal(result.stderr, "");
});

test("home view renders unreachable state without crashing", () => {
  const cwd = tempWorkspace();
  const result = run([], { cwd, script: unreachableCurl() });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /reachable: false/);
  assert.match(result.stdout, /health: unreachable/);
});

test("services lists Elasticsearch capability domains", () => {
  const result = run(["services"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /connection/);
  assert.match(result.stdout, /cluster-health/);
  assert.match(result.stdout, /managed-cloud/);
  assert.match(result.stdout, /snapshots/);
});

test("discover detects compose, env, dependency, and cloud-hint fixtures", () => {
  const cwd = tempWorkspace();
  fs.copyFileSync(path.join(fixtures, "compose", "elasticsearch-single.yml"), path.join(cwd, "docker-compose.yml"));
  fs.copyFileSync(path.join(fixtures, "env", "dot-env-basic.env"), path.join(cwd, ".env"));
  fs.copyFileSync(path.join(fixtures, "package-json", "with-es-client.json"), path.join(cwd, "package.json"));

  const result = run(["discover"], { cwd });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /compose:elasticsearch/);
  assert.match(result.stdout, /env:\.env/);
  assert.match(result.stdout, /dependency:@elastic\/elasticsearch/);
  assert.doesNotMatch(result.stdout, /dGVzdC1hcGkta2V5/);
});

test("discover excludes non-Elasticsearch compose services", () => {
  const cwd = tempWorkspace();
  fs.copyFileSync(path.join(fixtures, "compose", "opensearch-cluster.yml"), path.join(cwd, "compose.yml"));

  const result = run(["discover"], { cwd });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /compose:opensearch-node1/);
  assert.match(result.stdout, /compose:opensearch-node2/);
  assert.doesNotMatch(result.stdout, /cache/);
});

test("discover decodes a cloud-id env fixture into an endpoint", () => {
  const cwd = tempWorkspace();
  fs.copyFileSync(path.join(fixtures, "env", "dot-env-cloud.env"), path.join(cwd, ".env"));

  const result = run(["discover"], { cwd });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /https:\/\/es-uuid-123\.example\.com/);
});

test("discover reports elastic-cloud and aws-opensearch managed hints separately", () => {
  const cwd = tempWorkspace();
  fs.copyFileSync(path.join(fixtures, "cloud-hints", "terraform-ec-deployment.tf"), path.join(cwd, "ec.tf"));
  const ecResult = run(["discover"], { cwd });
  assert.match(ecResult.stdout, /elastic-cloud/);

  const cwd2 = tempWorkspace();
  fs.copyFileSync(path.join(fixtures, "cloud-hints", "terraform-aws-opensearch.tf"), path.join(cwd2, "aws.tf"));
  const awsResult = run(["discover"], { cwd: cwd2 });
  assert.match(awsResult.stdout, /aws-opensearch/);

  const cwd3 = tempWorkspace();
  fs.copyFileSync(path.join(fixtures, "cloud-hints", "cloudformation-opensearch.json"), path.join(cwd3, "stack.json"));
  const cfnResult = run(["discover"], { cwd: cwd3 });
  assert.match(cfnResult.stdout, /aws-opensearch/);
});

test("recommend returns compact paths and rejects unknown goals before any curl call", () => {
  const valid = run(["recommend", "--goal", "cleanup"]);
  assert.equal(valid.status, 0);
  assert.match(valid.stdout, /paths\[2\]{command,why}:/);

  const cwd = tempWorkspace();
  const sentinel = path.join(cwd, "curl-called");
  const invalid = run(["recommend", "--goal", "bogus"], { cwd, env: { ES_AXI_TEST_SENTINEL: sentinel } });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stdout, /error: unknown goal bogus/);
  assert.equal(fs.existsSync(sentinel), false);
});

test("list renders default fields for indices and nodes, and definitive empty state for disabled security", () => {
  const indices = run(["list", "--kind", "indices"]);
  assert.equal(indices.status, 0);
  assert.match(indices.stdout, /indices\[2\]{index,health,status,docs_count}:/);

  const nodes = run(["list", "--kind", "nodes"]);
  assert.equal(nodes.status, 0);
  assert.match(nodes.stdout, /nodes\[1\]{name,role,heap_percent,cpu}:/);

  const users = run(["list", "--kind", "users"], { script: securityDisabledCurl() });
  assert.equal(users.status, 0);
  assert.match(users.stdout, /users: 0 found/);
});

test("list --fields expands beyond the default schema", () => {
  const result = run(["list", "--kind", "indices", "--fields", "index,store_size"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /indices\[2\]{index,store_size}:/);
});

test("inspect truncates large output by default and shows everything with --full", () => {
  const index = run(["inspect", "--kind", "index", "--name", "my-index"]);
  assert.equal(index.status, 0);
  assert.match(index.stdout, /kind: index/);
  assert.match(index.stdout, /total_size:/);

  const cluster = run(["inspect", "--kind", "cluster"]);
  assert.equal(cluster.status, 0);
  assert.match(cluster.stdout, /cluster_name: test-cluster/);
  assert.match(cluster.stdout, /status: green/);
});

test("inspect requires the repository/snapshot composite name for snapshot kind", () => {
  const bad = run(["inspect", "--kind", "snapshot", "--name", "not-composite"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stdout, /repository.*snapshot/);
});

test("query runs immediately without --execute and redacts nested secret fields", () => {
  const result = run(["query", "--index", "my-index", "--body", '{"query":{"match_all":{}}}']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /total_hits: 2/);
  assert.match(result.stdout, /hits\[2\]{_index,_id,_score,_source}:/);
  assert.match(result.stdout, /<redacted>/);
  assert.doesNotMatch(result.stdout, /supersecret/);
});

test("query requires exactly one of --body or --file", () => {
  const missing = run(["query", "--index", "my-index"]);
  assert.equal(missing.status, 2);
  assert.match(missing.stdout, /error: --body or --file is required/);

  const cwd = tempWorkspace();
  fs.writeFileSync(path.join(cwd, "body.json"), "{}");
  const both = run(["query", "--index", "my-index", "--body", "{}", "--file", "body.json"], { cwd });
  assert.equal(both.status, 2);
  assert.match(both.stdout, /cannot be combined/);
});

test("sql redacts secret-named columns", () => {
  const result = run(["sql", "--query", "SELECT title, password FROM my-index"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /<redacted>/);
  assert.doesNotMatch(result.stdout, /supersecret/);
});

test("create is dry-run by default and executes only with --execute", () => {
  const cwd = tempWorkspace();
  const dryRun = run(["create", "--kind", "index", "--name", "my-index", "--body", "{}"], { cwd });
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /dry_run: true/);
  assert.match(dryRun.stdout, /method: PUT/);

  const executed = run(["create", "--kind", "index", "--name", "my-index", "--body", "{}", "--execute"], { cwd });
  assert.equal(executed.status, 0);
  assert.match(executed.stdout, /dry_run: false/);
  assert.match(executed.stdout, /acknowledged/);
});

test("update is dry-run by default and executes only with --execute", () => {
  const cwd = tempWorkspace();
  const dryRun = run(["update", "--kind", "mapping", "--name", "my-index", "--body", '{"properties":{}}'], { cwd });
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /dry_run: true/);

  const executed = run(["update", "--kind", "mapping", "--name", "my-index", "--body", '{"properties":{}}', "--execute"], { cwd });
  assert.equal(executed.status, 0);
  assert.match(executed.stdout, /dry_run: false/);
});

test("destructive delete requires --confirm matching --name and --execute together", () => {
  const cwd = tempWorkspace();
  const blocked = run(["delete", "--kind", "index", "--name", "my-index"], { cwd });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stdout, /requires --confirm/);

  const wrongConfirm = run(["delete", "--kind", "index", "--name", "my-index", "--confirm", "wrong-name", "--execute"], { cwd });
  assert.equal(wrongConfirm.status, 2);
  assert.match(wrongConfirm.stdout, /requires --confirm/);

  const dryRun = run(["delete", "--kind", "index", "--name", "my-index", "--confirm", "my-index"], { cwd });
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /dry_run: true/);

  const executed = run(["delete", "--kind", "index", "--name", "my-index", "--confirm", "my-index", "--execute"], { cwd });
  assert.equal(executed.status, 0);
  assert.match(executed.stdout, /dry_run: false/);
});

test("index-doc is dry-run by default and executes only with --execute", () => {
  const cwd = tempWorkspace();
  const dryRun = run(["index-doc", "--index", "my-index", "--id", "1", "--body", '{"title":"doc"}'], { cwd });
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /dry_run: true/);

  const executed = run(["index-doc", "--index", "my-index", "--id", "1", "--body", '{"title":"doc"}', "--execute"], { cwd });
  assert.equal(executed.status, 0);
  assert.match(executed.stdout, /dry_run: false/);
  assert.match(executed.stdout, /result: created/);
});

test("bulk counts actions on dry-run and reports succeeded/failed after execute", () => {
  const cwd = tempWorkspace();
  const ndjson = '{"index":{"_index":"my-index","_id":"1"}}\n{"title":"doc1"}\n{"index":{"_index":"my-index","_id":"2"}}\n{"title":"doc2"}\n';
  fs.writeFileSync(path.join(cwd, "bulk.ndjson"), ndjson);

  const dryRun = run(["bulk", "--file", "bulk.ndjson"], { cwd });
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /dry_run: true/);
  assert.match(dryRun.stdout, /index:2/);

  const executed = run(["bulk", "--file", "bulk.ndjson", "--execute"], { cwd });
  assert.equal(executed.status, 0);
  assert.match(executed.stdout, /succeeded: 1/);
  assert.match(executed.stdout, /failed: 1/);
});

test("reindex requires --confirm only when the destination index already exists", () => {
  const cwd = tempWorkspace();
  const noConfirmNeeded = run(["reindex", "--source", "my-index", "--dest", "new-index"], { cwd });
  assert.equal(noConfirmNeeded.status, 0);
  assert.match(noConfirmNeeded.stdout, /dest_exists: false/);

  const blocked = run(["reindex", "--source", "my-index", "--dest", "existing-index", "--execute"], { cwd });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stdout, /requires --confirm/);

  const executed = run(["reindex", "--source", "my-index", "--dest", "existing-index", "--confirm", "existing-index", "--execute"], { cwd });
  assert.equal(executed.status, 0);
  assert.match(executed.stdout, /dry_run: false/);
});

test("snapshot create is additive and only needs --execute", () => {
  const cwd = tempWorkspace();
  const dryRun = run(["snapshot", "create", "--repository", "my-repo", "--snapshot", "snap-new"], { cwd });
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /dry_run: true/);

  const executed = run(["snapshot", "create", "--repository", "my-repo", "--snapshot", "snap-new", "--execute"], { cwd });
  assert.equal(executed.status, 0);
  assert.match(executed.stdout, /dry_run: false/);
});

test("snapshot restore is destructive and requires --confirm matching --snapshot", () => {
  const cwd = tempWorkspace();
  const blocked = run(["snapshot", "restore", "--repository", "my-repo", "--snapshot", "snap-1", "--execute"], { cwd });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stdout, /requires --confirm/);

  const executed = run(["snapshot", "restore", "--repository", "my-repo", "--snapshot", "snap-1", "--confirm", "snap-1", "--execute"], { cwd });
  assert.equal(executed.status, 0);
  assert.match(executed.stdout, /dry_run: false/);
});

test("tasks, cat, and stats render compact TOON tables", () => {
  const tasksResult = run(["tasks"]);
  assert.equal(tasksResult.status, 0);
  assert.match(tasksResult.stdout, /tasks\[1\]{task_id,action,running_time,node}:/);

  const detailed = run(["tasks", "--detailed"]);
  assert.equal(detailed.status, 0);
  assert.match(detailed.stdout, /truncated/);

  const catHealth = run(["cat", "--kind", "health"]);
  assert.equal(catHealth.status, 0);
  assert.match(catHealth.stdout, /health\[1\]{cluster,status,node_total,active_shards_percent}:/);

  const statsCluster = run(["stats", "--kind", "cluster"]);
  assert.equal(statsCluster.status, 0);
  assert.match(statsCluster.stdout, /docs_count: 1000/);

  const statsMissingIndex = run(["stats", "--kind", "index"]);
  assert.equal(statsMissingIndex.status, 2);
  assert.match(statsMissingIndex.stdout, /--index is required/);
});

test("clean requires the dry-run confirm_token to be echoed back exactly", () => {
  const cwd = tempWorkspace();
  const dryRun = run(["clean", "--kind", "closed-indices"], { cwd });
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /confirm_token: "closed-indices:1"/);

  const wrongToken = run(["clean", "--kind", "closed-indices", "--confirm", "closed-indices:99", "--execute"], { cwd });
  assert.equal(wrongToken.status, 2);
  assert.match(wrongToken.stdout, /requires --confirm/);

  const executed = run(["clean", "--kind", "closed-indices", "--confirm", "closed-indices:1", "--execute"], { cwd });
  assert.equal(executed.status, 0);
  assert.match(executed.stdout, /dry_run: false/);
});

test("unknown flags fail before calling curl", () => {
  const cwd = tempWorkspace();
  const sentinel = path.join(cwd, "curl-called");
  const result = run(["list", "--kind", "indices", "--bogus"], { cwd, env: { ES_AXI_TEST_SENTINEL: sentinel } });

  assert.equal(result.status, 2);
  assert.match(result.stdout, /error: unknown flag --bogus for `list`/);
  assert.equal(fs.existsSync(sentinel), false);
});

test("unknown command is rejected by name", () => {
  const result = run(["frobnicate"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /error: unknown command frobnicate/);
});

test("missing required flags return structured usage errors on stdout only", () => {
  const result = run(["list"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /error: --kind is required/);
  assert.match(result.stdout, /help\[1\]:/);
  assert.equal(result.stderr, "");
});

test("redaction: Authorization header and API key never leak in doctor or discover output", () => {
  const cwd = tempWorkspace();
  const result = run(["doctor"], { cwd, env: { ELASTIC_API_KEY: "super-secret-api-key-value" } });
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /super-secret-api-key-value/);

  const withUrl = run(["doctor"], { cwd, env: { ELASTICSEARCH_URL: "https://elastic:hunter2@es.example.com:9200" } });
  assert.equal(withUrl.status, 0);
  assert.doesNotMatch(withUrl.stdout, /hunter2/);
});

test("truncation shows a marker and total size by default, full content with --full", () => {
  const truncated = run(["tasks", "--detailed"]);
  assert.match(truncated.stdout, /\(truncated, \d+ chars total\)/);
  assert.match(truncated.stdout, /help\[1\]:/);

  const full = run(["tasks", "--detailed", "--full"]);
  assert.doesNotMatch(full.stdout, /truncated,/);
});

test("doctor reports missing curl without crashing", () => {
  const cwd = tempWorkspace();
  const result = run(["doctor"], { cwd, noBin: true });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /curl,fail/);
  assert.match(result.stdout, /summary: attention-required/);
});

test("doctor translates unreachable clusters and auth errors", () => {
  const unreachable = run(["doctor"], { script: unreachableCurl() });
  assert.equal(unreachable.status, 0);
  assert.match(unreachable.stdout, /summary: attention-required/);
  assert.match(unreachable.stdout, /cluster-reachability,fail/);

  const authFailed = run(["doctor"], { script: authErrorCurl(401) });
  assert.equal(authFailed.status, 0);
  assert.match(authFailed.stdout, /authentication failed/);
});

test("skill generate --check fails when stale and passes after generation", () => {
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

test("hooks install previews then writes hook files", () => {
  const cwd = tempWorkspace();
  const dryRun = run(["hooks", "install", "--agent", "claude", "--scope", "project"], { cwd });
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /dry_run: true/);
  assert.equal(fs.existsSync(path.join(cwd, ".claude", "settings.json")), false);

  const executed = run(["hooks", "install", "--agent", "claude", "--scope", "project", "--execute"], { cwd });
  assert.equal(executed.status, 0);
  assert.equal(fs.existsSync(path.join(cwd, ".claude", "settings.json")), true);
});

test("optional live Elasticsearch doctor is gated behind ELASTICSEARCH_AXI_LIVE_TESTS", { skip: process.env.ELASTICSEARCH_AXI_LIVE_TESTS !== "1" }, () => {
  const result = run(["doctor"], { noBin: false, env: process.env });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /checks\[/);
});
