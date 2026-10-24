import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "bin", "kubernetes-axi.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kubernetes-axi-"));
}

function makeFakeBin(workspace, handlers = {}) {
  const bin = path.join(workspace, "bin");
  fs.mkdirSync(bin, { recursive: true });
  for (const name of ["kubectl", "helm", "kustomize"]) {
    const script = handlers[name] ?? defaultFake(name);
    const file = path.join(bin, name);
    fs.writeFileSync(file, script);
    fs.chmodSync(file, 0o755);
  }
  return bin;
}

function defaultFake(name) {
  if (name === "helm") {
    return `#!/bin/sh
echo 'v3.14.0'
`;
  }
  if (name === "kustomize") {
    return `#!/bin/sh
echo 'v5.0.0'
`;
  }
  return `#!/bin/sh
# record calls for unknown-flag tests
case "$*" in
  *"version -o json"*|*"version"*)
    echo '{"clientVersion":{"major":"1","minor":"30","gitVersion":"v1.30.0"},"serverVersion":{"major":"1","minor":"30","gitVersion":"v1.30.0"}}'
    exit 0
    ;;
esac
case "$1 $2" in
  "config current-context") echo 'kind-kind' ;;
  "config view")
    if echo "$*" | grep -q minify; then
      if echo "$*" | grep -q jsonpath; then echo 'default'; else
        echo 'apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: SUPERSECRET CERT
    server: https://127.0.0.1
  name: kind
users:
- name: kind
  user:
    client-certificate-data: CERTDATA
    client-key-data: KEYDATA
    token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaa.bbbb
contexts:
- context:
    cluster: kind
    user: kind
    namespace: default
  name: kind-kind
current-context: kind-kind'
      fi
    else
      echo 'config'
    fi
    ;;
  "config set-context") echo "Context \\\"kind-kind\\\" modified." ;;
  "auth can-i") echo 'yes' ;;
  "top nodes") echo 'NAME CPU MEMORY' ;;
  "get nodes") echo '{"items":[{"metadata":{"name":"node1"}}]}' ;;
  "get deployments") echo '{"items":[{"metadata":{"name":"web","creationTimestamp":"2026-01-01T00:00:00Z"},"status":{"readyReplicas":1,"replicas":1,"updatedReplicas":1,"availableReplicas":1},"spec":{"replicas":1}}]}' ;;
  "get pods")
    if echo "$*" | grep -q 'field-selector'; then echo '{"items":[]}'; exit 0; fi
    echo '{"items":[{"metadata":{"name":"web-1","namespace":"default","creationTimestamp":"2026-01-01T00:00:00Z"},"status":{"phase":"Running","containerStatuses":[{"ready":true,"restartCount":0}]},"spec":{"containers":[{"name":"web"}]}}]}'
    ;;
  "get services") echo '{"items":[{"metadata":{"name":"web","creationTimestamp":"2026-01-01T00:00:00Z"},"spec":{"type":"ClusterIP","clusterIP":"10.0.0.1","ports":[{"port":80,"targetPort":8080}]}}]}' ;;
  "get events") echo '{"items":[{"type":"Normal","reason":"Started","involvedObject":{"name":"web-1"},"message":"TOKEN=supersecret started","lastTimestamp":"2026-01-01T00:00:00Z"}]}' ;;
  "get pod"|"get deployment"|"get secret")
    if echo "$*" | grep -q ' -o yaml'; then
      echo 'apiVersion: v1
kind: Secret
metadata:
  name: db
data:
  password: c3VwZXJzZWNyZXQ=
stringData:
  apiKey: raw-secret-value
'
    else
      echo 'ok'
    fi
    ;;
  "logs web-1"|*"logs"*)
    echo 'TOKEN=supersecret'
    printf 'x%.0s' $(seq 1 1800)
    echo
    ;;
  "rollout status") echo 'deployment "web" successfully rolled out' ;;
  "rollout restart") echo 'deployment.apps/web restarted' ;;
  "scale deployment/web"|*"scale"*) echo 'deployment.apps/web scaled' ;;
  "expose deployment"|*"expose"*) echo 'service/web exposed' ;;
  "port-forward"*) echo 'Forwarding from 127.0.0.1:8080 -> 80'; sleep 10 ;;
  "exec web-1"|*"exec"*) echo 'exec output' ;;
  "apply"*) echo 'deployment.apps/web configured' ;;
  "delete"*) echo 'pod "web-1" deleted' ;;
  "kustomize"*) echo 'apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
' ;;
  *) echo "kubectl ok $*" ;;
esac
`;
}

function run(args, options = {}) {
  const cwd = options.cwd ?? tempWorkspace();
  const env = { ...process.env, ...(options.env ?? {}) };
  return spawnSync(cli, args, { cwd, env, encoding: "utf8" });
}

function withFake(cwd = tempWorkspace(), handlers = {}) {
  const fakeBin = makeFakeBin(cwd, handlers);
  return { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` }, fakeBin };
}

test("home view shows live Kubernetes context and no help-first output", () => {
  const { cwd, env } = withFake();
  fs.mkdirSync(path.join(cwd, "k8s"));
  fs.writeFileSync(path.join(cwd, "k8s", "deploy.yaml"), "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n");
  const result = run([], { cwd, env });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^bin: /);
  assert.match(result.stdout, /description: "Operate Kubernetes workloads/);
  assert.match(result.stdout, /kubectl: ok/);
  assert.match(result.stdout, /context: kind-kind/);
  assert.match(result.stdout, /targets\[/);
  assert.doesNotMatch(result.stdout, /^usage:/);
});

test("services include Kubernetes capability domains", () => {
  const result = run(["services"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /discover/);
  assert.match(result.stdout, /deploy/);
  assert.match(result.stdout, /rollout/);
  assert.match(result.stdout, /managed/);
});

test("discover detects manifests, kustomize, helm, and local hints", () => {
  const { cwd, env } = withFake();
  fs.mkdirSync(path.join(cwd, "overlays", "dev"), { recursive: true });
  fs.mkdirSync(path.join(cwd, "chart"), { recursive: true });
  fs.mkdirSync(path.join(cwd, "manifests"));
  fs.writeFileSync(path.join(cwd, "deploy.yaml"), "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: web\n");
  fs.writeFileSync(path.join(cwd, "overlays", "dev", "kustomization.yaml"), "resources:\n- ../../deploy.yaml\n");
  fs.writeFileSync(path.join(cwd, "chart", "Chart.yaml"), "apiVersion: v2\nname: web\nversion: 0.1.0\n");
  fs.writeFileSync(path.join(cwd, "manifests", "cm.yaml"), "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: app\ndata:\n  PASSWORD: secret\n");
  fs.writeFileSync(path.join(cwd, "skaffold.yaml"), "apiVersion: skaffold/v4beta11\nkind: Config\n");
  fs.writeFileSync(path.join(cwd, "docker-compose.yml"), "services:\n  web:\n    image: app\n");
  const result = run(["discover", "--full"], { cwd, env });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /manifest:deploy\.yaml/);
  assert.match(result.stdout, /kustomize:/);
  assert.match(result.stdout, /helm:/);
  assert.match(result.stdout, /manifests-dir:manifests/);
  assert.match(result.stdout, /skaffold:/);
  assert.match(result.stdout, /compose-hint:/);
  assert.match(result.stdout, /local-cluster:/);
});

test("recommend returns compact paths for deploy", () => {
  const result = run(["recommend", "--goal", "deploy"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /paths\[3\]{id,pattern,fit,command}:/);
  assert.match(result.stdout, /manifest-apply/);
});

test("unknown flags fail before calling kubectl", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd, {
    kubectl: "#!/bin/sh\necho called >> kubectl-called\nexit 0\n"
  });
  const result = run(["discover", "--stat"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /error: unknown flag --stat for `discover`/);
  assert.equal(fs.existsSync(path.join(cwd, "kubectl-called")), false);
});

test("missing required flags return structured usage errors", () => {
  const result = run(["logs"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /error: --pod is required/);
  assert.match(result.stdout, /help\[1\]:/);
});

test("list inspect logs events produce TOON output with truncation and redaction", () => {
  const { cwd, env } = withFake();
  const list = run(["list", "--kind", "pods"], { cwd, env });
  assert.equal(list.status, 0);
  assert.match(list.stdout, /pods\[1\]{name,ready,status,restarts,age}:/);

  const inspect = run(["inspect", "--kind", "secret", "--name", "db"], { cwd, env });
  assert.equal(inspect.status, 0);
  assert.doesNotMatch(inspect.stdout, /c3VwZXJzZWNyZXQ=/);
  assert.doesNotMatch(inspect.stdout, /raw-secret-value/);
  assert.match(inspect.stdout, /<redacted>/);

  const logs = run(["logs", "--pod", "web-1"], { cwd, env });
  assert.equal(logs.status, 0);
  assert.doesNotMatch(logs.stdout, /supersecret/);
  assert.match(logs.stdout, /truncated/);

  const full = run(["logs", "--pod", "web-1", "--full"], { cwd, env });
  assert.equal(full.status, 0);
  assert.doesNotMatch(full.stdout, /supersecret/);

  const events = run(["events"], { cwd, env });
  assert.equal(events.status, 0);
  assert.match(events.stdout, /events\[/);
  assert.doesNotMatch(events.stdout, /supersecret/);
});

test("mutating commands default to dry-run and require --execute", () => {
  const { cwd, env } = withFake();
  fs.writeFileSync(path.join(cwd, "deploy.yaml"), "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n");
  const apply = run(["apply", "--file", "deploy.yaml"], { cwd, env });
  assert.equal(apply.status, 0);
  assert.match(apply.stdout, /dry_run: true/);

  const applyExec = run(["apply", "--file", "deploy.yaml", "--execute"], { cwd, env });
  assert.equal(applyExec.status, 0);
  assert.match(applyExec.stdout, /dry_run: false/);

  const restart = run(["rollout", "restart", "--name", "web"], { cwd, env });
  assert.equal(restart.status, 0);
  assert.match(restart.stdout, /dry_run: true/);

  const scale = run(["scale", "--name", "web", "--replicas", "3"], { cwd, env });
  assert.equal(scale.status, 0);
  assert.match(scale.stdout, /dry_run: true/);

  const clean = run(["clean", "--kind", "completed-pods"], { cwd, env });
  assert.equal(clean.status, 0);
  assert.match(clean.stdout, /dry_run: true/);
});

test("delete requires --confirm matching --name and --execute", () => {
  const { cwd, env } = withFake();
  const missing = run(["delete", "--kind", "pod", "--name", "web-1"], { cwd, env });
  assert.equal(missing.status, 2);
  assert.match(missing.stdout, /--confirm/);

  const dry = run(["delete", "--kind", "pod", "--name", "web-1", "--confirm", "web-1"], { cwd, env });
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /dry_run: true/);

  const exec = run(["delete", "--kind", "pod", "--name", "web-1", "--confirm", "web-1", "--execute"], { cwd, env });
  assert.equal(exec.status, 0);
  assert.match(exec.stdout, /dry_run: false/);
});

test("doctor reports missing kubectl without crashing", () => {
  const cwd = tempWorkspace();
  const emptyBin = path.join(cwd, "empty-bin");
  fs.mkdirSync(emptyBin);
  const nodeDir = path.dirname(process.execPath);
  const result = run(["doctor"], { cwd, env: { PATH: `${emptyBin}${path.delimiter}${nodeDir}` } });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /kubectl/);
  assert.match(result.stdout, /missing/);
});

test("namespace handling is accepted on list", () => {
  const { cwd, env } = withFake();
  const result = run(["list", "--kind", "pods", "--namespace", "default"], { cwd, env });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /pods\[/);
});

test("config view redacts kubeconfig secrets", () => {
  const { cwd, env } = withFake();
  const result = run(["config", "view"], { cwd, env });
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /KEYDATA/);
  assert.doesNotMatch(result.stdout, /CERTDATA/);
  assert.match(result.stdout, /<redacted>/);
});

test("skill generate --check fails when stale then passes after generate", () => {
  const cwd = tempWorkspace();
  const stale = run(["skill", "generate", "--check"], { cwd });
  assert.equal(stale.status, 1);
  const written = run(["skill", "generate"], { cwd });
  assert.equal(written.status, 0);
  const ok = run(["skill", "generate", "--check"], { cwd });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /skill: up-to-date/);
});

test("optional live doctor is gated by KUBERNETES_AXI_LIVE_TESTS", { skip: process.env.KUBERNETES_AXI_LIVE_TESTS !== "1" }, () => {
  const result = run(["doctor"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /summary:/);
});
