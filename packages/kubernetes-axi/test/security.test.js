import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "bin", "kubernetes-axi.js");

// Hardening added in the corporate build (see SECURITY-REVIEW.md):
// kubeconfig is never fetched with --raw, and Secrets are shown by key name only.

function fakeKubectl() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "k8s-axi-sec-"));
  const bin = path.join(cwd, "bin");
  fs.mkdirSync(bin);
  const log = path.join(cwd, "kubectl.log");
  const secretJson = JSON.stringify({
    apiVersion: "v1",
    kind: "Secret",
    type: "Opaque",
    metadata: {
      name: "db",
      namespace: "prod",
      annotations: { "kubectl.kubernetes.io/last-applied-configuration": '{"data":{"conn":"TOP-SECRET-VALUE-1"}}' },
    },
    data: { conn: "VE9QLVNFQ1JFVC1WQUxVRS0x", other: "T1RIRVItU0VDUkVU" },
  });
  fs.writeFileSync(
    path.join(bin, "kubectl"),
    `#!/bin/sh
echo "$*" >> '${log}'
case "$*" in
  *"get secret"*|*"get Secret"*) cat <<'EOF'
${secretJson}
EOF
  ;;
  *"config view"*) echo 'users: [{name: u, user: {client-key-data: DATA+OMITTED}}]' ;;
  *) echo '{}' ;;
esac
`,
  );
  fs.chmodSync(path.join(bin, "kubectl"), 0o755);
  return { cwd, bin, log };
}

function run(args, { cwd, bin }) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    encoding: "utf8",
  });
}

test("config view never asks kubectl for raw credentials", () => {
  const { cwd, bin, log } = fakeKubectl();
  const result = run(["config", "view", "--full"], { cwd, bin });
  assert.equal(result.status, 0);
  const calls = fs.readFileSync(log, "utf8");
  assert.match(calls, /config view --minify/);
  assert.doesNotMatch(calls, /--raw/);
});

test("inspecting a Secret shows key names only - never values or the last-applied annotation", () => {
  const { cwd, bin } = fakeKubectl();
  for (const kind of ["secret", "secrets", "Secret"]) {
    const result = run(["inspect", "--kind", kind, "--name", "db", "--namespace", "prod", "--full"], { cwd, bin });
    assert.equal(result.status, 0, kind);
    assert.match(result.stdout, /conn/);
    assert.match(result.stdout, /other/);
    assert.doesNotMatch(result.stdout, /TOP-SECRET-VALUE-1|VE9QLVNFQ1JFVC1WQUxVRS0x|T1RIRVItU0VDUkVU|last-applied/, kind);
    assert.match(result.stdout, /secret values are never shown/);
  }
});
