import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "bin", "elasticsearch-axi.js");

// Hardening added in the corporate build (see SECURITY-REVIEW.md): credentials never on the curl command line,
// curl limited to http(s), --insecure needs an explicit environment opt-in, no wildcard deletes.

function setup() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "es-axi-sec-"));
  const bin = path.join(cwd, "bin");
  fs.mkdirSync(bin);
  const log = path.join(cwd, "curl.log");
  fs.writeFileSync(
    path.join(bin, "curl"),
    `#!/bin/sh
printf 'ARGS=%s\\n' "$*" >> '${log}'
if [ ! -t 0 ]; then cat >> '${log}.stdin'; fi
printf '{"cluster_name":"c","version":{"number":"8.0.0"},"status":"green"}\\n200'
`,
  );
  fs.chmodSync(path.join(bin, "curl"), 0o755);
  return { cwd, bin, log };
}

function run(args, { cwd, bin, env = {} }) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, ...env },
    encoding: "utf8",
  });
}

test("credentials go to curl on stdin, never on the command line; curl is limited to http(s)", () => {
  const { cwd, bin, log } = setup();
  const result = run(["doctor", "--url", "https://es.example.com:9200", "--api-key", "id:SUPERSECRETKEY"], { cwd, bin });
  assert.equal(result.status, 0, result.stdout);
  const args = fs.readFileSync(log, "utf8");
  assert.doesNotMatch(args, /SUPERSECRETKEY|Authorization|ApiKey|aWQ6/);
  assert.match(args, /--proto =http,https/);
  assert.match(args, /-K -/);
  const stdin = fs.readFileSync(`${log}.stdin`, "utf8");
  assert.match(stdin, /^header = "Authorization: ApiKey /);
});

test("basic-auth credentials embedded in the URL stay off the command line too", () => {
  const { cwd, bin, log } = setup();
  const result = run(["doctor", "--url", "https://elastic:hunter2@es.example.com:9200"], { cwd, bin });
  assert.equal(result.status, 0, result.stdout);
  assert.doesNotMatch(fs.readFileSync(log, "utf8"), /hunter2|elastic:|Basic /);
});

test("non-http(s) endpoints (file://, gopher://, ...) are refused before curl runs", () => {
  const { cwd, bin, log } = setup();
  for (const url of ["file:///etc/hostname", "gopher://localhost:70/x", "dict://localhost:11211/info", "ftp://example.com/x"]) {
    const result = run(["doctor", "--url", url], { cwd, bin });
    assert.notEqual(result.status, 0, url);
    assert.match(result.stdout, /http:\/\/ or https:\/\//, url);
  }
  assert.equal(fs.existsSync(log), false, "curl must not have been invoked");
});

test("--insecure is refused unless ELASTICSEARCH_AXI_ALLOW_INSECURE=1", () => {
  const { cwd, bin, log } = setup();
  const refused = run(["doctor", "--url", "https://es.example.com", "--insecure"], { cwd, bin });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stdout, /ELASTICSEARCH_AXI_ALLOW_INSECURE/);
  assert.equal(fs.existsSync(log), false);

  const allowed = run(["doctor", "--url", "https://es.example.com", "--insecure"], { cwd, bin, env: { ELASTICSEARCH_AXI_ALLOW_INSECURE: "1" } });
  assert.equal(allowed.status, 0, allowed.stdout);
  assert.match(fs.readFileSync(log, "utf8"), / -k/);
});

test("delete refuses wildcards, lists and _all as names", () => {
  const { cwd, bin } = setup();
  for (const name of ["*", "logs-*", "a,b", "_all", "idx?"]) {
    const result = run(["delete", "--kind", "index", "--name", name, "--confirm", name], { cwd, bin });
    assert.notEqual(result.status, 0, name);
    assert.match(result.stdout, /concrete name/, name);
  }
  const ok = run(["delete", "--kind", "index", "--name", "logs-2026", "--confirm", "logs-2026"], { cwd, bin });
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /dry_run: true/);
});
