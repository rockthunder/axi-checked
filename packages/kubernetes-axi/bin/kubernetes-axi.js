#!/bin/sh
':' //; exec node -- "$0" "$@"
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const DESCRIPTION = "Operate Kubernetes workloads through safe discover, deploy, debug, scale, and cleanup AXI workflows";
const VERSION = "0.1.0";
const PREVIEW_LIMIT = 1200;
const LOG_LIMIT = 1500;
const GLOBAL_VALUE_FLAGS = new Set(["--cwd", "--namespace"]);
const GLOBAL_BOOLEAN_FLAGS = new Set(["--help"]);

const COMMANDS = {
  home: { value: new Set(), boolean: new Set(["--help"]), help: helpHome },
  doctor: { value: new Set(), boolean: new Set(["--help"]), help: helpDoctor },
  services: { value: new Set(["--capability", "--fields"]), boolean: new Set(["--help"]), help: helpServices },
  discover: { value: new Set(["--fields"]), boolean: new Set(["--full", "--help"]), help: helpDiscover },
  recommend: { value: new Set(["--goal"]), boolean: new Set(["--help"]), help: helpRecommend },
  list: { value: new Set(["--kind", "--fields", "--selector", "--limit"]), boolean: new Set(["--help"]), help: helpList },
  inspect: { value: new Set(["--kind", "--name"]), boolean: new Set(["--full", "--help"]), help: helpInspect },
  logs: { value: new Set(["--pod", "--container", "--tail"]), boolean: new Set(["--full", "--help"]), help: helpLogs },
  events: { value: new Set(["--limit"]), boolean: new Set(["--full", "--help"]), help: helpEvents },
  plan: { value: new Set(["--target", "--environment"]), boolean: new Set(["--full", "--help"]), help: helpPlan },
  apply: { value: new Set(["--target", "--environment", "--file"]), boolean: new Set(["--execute", "--full", "--help"]), help: helpApply },
  delete: { value: new Set(["--kind", "--name", "--confirm"]), boolean: new Set(["--execute", "--help"]), help: helpDelete },
  "rollout status": { value: new Set(["--kind", "--name"]), boolean: new Set(["--help"]), help: helpRolloutStatus },
  "rollout restart": { value: new Set(["--kind", "--name"]), boolean: new Set(["--execute", "--help"]), help: helpRolloutRestart },
  scale: { value: new Set(["--kind", "--name", "--replicas"]), boolean: new Set(["--execute", "--help"]), help: helpScale },
  expose: { value: new Set(["--kind", "--name", "--port", "--type"]), boolean: new Set(["--execute", "--help"]), help: helpExpose },
  "port-forward": { value: new Set(["--resource", "--ports", "--timeout"]), boolean: new Set(["--execute", "--help"]), help: helpPortForward },
  exec: { value: new Set(["--pod", "--container", "--cmd"]), rest: "--cmd", boolean: new Set(["--execute", "--help"]), help: helpExec },
  "config view": { value: new Set(), boolean: new Set(["--full", "--help"]), help: helpConfigView },
  "config namespace": { value: new Set(["--namespace"]), boolean: new Set(["--execute", "--help"]), help: helpConfigNamespace },
  clean: { value: new Set(["--kind"]), boolean: new Set(["--execute", "--help"]), help: helpClean },
  "hooks install": { value: new Set(["--agent", "--scope"]), boolean: new Set(["--execute", "--help"]), help: helpHooksInstall },
  "skill generate": { value: new Set(["--output"]), boolean: new Set(["--check", "--help"]), help: helpSkillGenerate }
};

const SERVICE_DOMAINS = [
  { capability: "discover", domain: "manifests|helm|kustomize|skaffold|tilt", use: "find Kubernetes sources in the workspace" },
  { capability: "deploy", domain: "apply|plan|helm|kustomize", use: "plan and apply workloads with dry-run defaults" },
  { capability: "debug", domain: "logs|events|inspect|exec", use: "debug pods with truncation and redaction" },
  { capability: "rollout", domain: "status|restart", use: "watch and restart deployments safely" },
  { capability: "scale", domain: "replicas|hpa-hints", use: "scale workloads after explicit --execute" },
  { capability: "expose", domain: "service|ingress|port-forward", use: "expose workloads without interactive prompts" },
  { capability: "networking", domain: "services|ingress|endpoints", use: "inspect cluster networking blast radius" },
  { capability: "config", domain: "context|namespace|kubeconfig", use: "view sanitized kubeconfig and set namespace" },
  { capability: "cleanup", domain: "delete|clean completed pods|jobs", use: "preview destructive cleanup before execution" },
  { capability: "local-dev", domain: "kind|minikube|docker-desktop", use: "orient local cluster workflows" },
  { capability: "managed", domain: "eks|gke|aks", use: "detect managed clusters and recommend provider workflows" },
  { capability: "security", domain: "secrets|rbac|redaction", use: "redact secrets tokens and kubeconfig credentials" }
];

const RECOMMENDATIONS = {
  deploy: [
    ["manifest-apply", "Deployment + Service YAML", "best for raw manifests", "kubernetes-axi plan --target <id> --environment local"],
    ["kustomize-apply", "kustomization.yaml", "best for overlays", "kubernetes-axi recommend --goal kustomize"],
    ["helm-apply", "Chart.yaml", "best for packaged apps", "kubernetes-axi recommend --goal helm"]
  ],
  debug: [
    ["pod-logs", "logs + events", "best for crash loops", "kubernetes-axi logs --pod <name>"],
    ["inspect-pod", "inspect describe", "best for scheduling failures", "kubernetes-axi inspect --kind pod --name <name>"],
    ["exec-shell", "non-interactive exec", "best for one-shot diagnostics", "kubernetes-axi exec --pod <name> --cmd -- ls /"]
  ],
  rollout: [
    ["rollout-status", "deployment status", "best during releases", "kubernetes-axi rollout status --name <name>"],
    ["rollout-restart", "restart with --execute", "best to bounce pods", "kubernetes-axi rollout restart --name <name>"],
    ["events-watch", "namespace events", "best after failed rollouts", "kubernetes-axi events"]
  ],
  scale: [
    ["scale-deploy", "replicas flag", "best for manual scale", "kubernetes-axi scale --kind deployment --name <name> --replicas <n>"],
    ["list-workloads", "list deployments", "best before scaling", "kubernetes-axi list --kind deployments"],
    ["managed-hpa", "provider HPA guidance", "best for autoscaling", "kubernetes-axi recommend --goal managed"]
  ],
  expose: [
    ["expose-svc", "ClusterIP/NodePort/LoadBalancer", "best for Service creation", "kubernetes-axi expose --kind deployment --name <name> --port <port>"],
    ["port-forward", "local port-forward", "best for agent debugging", "kubernetes-axi port-forward --resource pod/<name> --ports 8080:80"],
    ["list-svc", "list services", "best to verify exposure", "kubernetes-axi list --kind services"]
  ],
  "local-dev": [
    ["kind-hint", "kind context", "best for local clusters", "kubernetes-axi doctor"],
    ["minikube-hint", "minikube context", "best for local clusters", "kubernetes-axi discover"],
    ["manifests-dir", "k8s/ or manifests/", "best for app-local YAML", "kubernetes-axi discover --full"]
  ],
  helm: [
    ["helm-chart", "Chart.yaml", "best for Helm apps", "kubernetes-axi discover"],
    ["helm-plan", "helm template/plan", "best before install", "kubernetes-axi plan --target <id> --environment local"],
    ["helm-apply", "helm upgrade --install", "best with --execute", "kubernetes-axi apply --target <id> --execute"]
  ],
  kustomize: [
    ["kustomize-overlay", "kustomization.yaml", "best for overlays", "kubernetes-axi discover"],
    ["kustomize-plan", "kustomize build", "best before apply", "kubernetes-axi plan --target <id>"],
    ["kustomize-apply", "kubectl apply -k", "best with --execute", "kubernetes-axi apply --target <id> --execute"]
  ],
  cleanup: [
    ["delete-guarded", "delete + confirm", "best for named resources", "kubernetes-axi delete --kind deployment --name <name> --confirm <name>"],
    ["clean-completed", "completed pods/jobs", "best for reclaiming", "kubernetes-axi clean --kind completed-pods"],
    ["list-before", "list then delete", "best to avoid mistakes", "kubernetes-axi list --kind pods"]
  ],
  managed: [
    ["eks-detect", "arn:aws:eks context", "best for AWS EKS", "kubernetes-axi doctor"],
    ["gke-detect", "gke_ context", "best for GKE", "kubernetes-axi config view"],
    ["aks-detect", "aks context", "best for AKS", "kubernetes-axi recommend --goal deploy"]
  ]
};

main();

function main() {
  const commandInfo = resolveCommand(process.argv.slice(2));
  const config = COMMANDS[commandInfo.command];
  if (!config) usageError(`unknown command ${toonScalar(commandInfo.command)}`, ["Run `kubernetes-axi --help` for available commands"]);
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
    logs,
    events,
    plan,
    apply,
    delete: deleteResource,
    "rollout status": rolloutStatus,
    "rollout restart": rolloutRestart,
    scale,
    expose,
    "port-forward": portForward,
    exec: execPod,
    "config view": configView,
    "config namespace": configNamespace,
    clean,
    "hooks install": hooksInstall,
    "skill generate": skillGenerate
  };
  handlers[commandInfo.command](parsed, context);
}

function resolveCommand(args) {
  if (args.length === 0 || args[0].startsWith("--")) return { command: "home", args };
  if (["rollout", "config", "hooks", "skill"].includes(args[0]) && args[1] && !args[1].startsWith("--")) {
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
      if (inlineValue !== undefined) usageError(`${rawName} does not take a value`, [`Run \`kubernetes-axi ${command} --help\` for examples`]);
      flags[flagName(rawName)] = true;
      continue;
    }
    if (config.rest === rawName) {
      const restParts = inlineValue !== undefined ? [inlineValue] : [];
      if (inlineValue === undefined) {
        for (let restIndex = index + 1; restIndex < args.length; restIndex += 1) {
          const next = args[restIndex];
          if (next === "--execute" || next === "--help") {
            flags[flagName(next)] = true;
            continue;
          }
          if (next === "--cwd" || next === "--namespace" || next === "--pod" || next === "--container") {
            const value = args[restIndex + 1];
            if (!value || value.startsWith("--")) usageError(`${next} requires a value`, [`Run \`kubernetes-axi ${command} --help\` for examples`]);
            flags[flagName(next)] = value;
            restIndex += 1;
            continue;
          }
          if (next.startsWith("--cwd=") || next.startsWith("--namespace=") || next.startsWith("--pod=") || next.startsWith("--container=")) {
            const [name, value] = next.split("=", 2);
            flags[flagName(name)] = value;
            continue;
          }
          restParts.push(next);
        }
      }
      const restValue = restParts.join(" ");
      if (!restValue) usageError(`${rawName} requires a value`, [`Run \`kubernetes-axi ${command} --help\` for examples`]);
      flags[flagName(rawName)] = restValue;
      index = args.length;
      continue;
    }
    const value = inlineValue ?? args[index + 1];
    if (value === undefined || value.startsWith("--")) usageError(`${rawName} requires a value`, [`Run \`kubernetes-axi ${command} --help\` for examples`]);
    flags[flagName(rawName)] = value;
    if (inlineValue === undefined) index += 1;
  }
  if (positional.length > 0) usageError(`unexpected argument ${toonScalar(positional[0])} for \`${command}\``, [`Run \`kubernetes-axi ${command} --help\` for examples`]);
  return { flags, positional };
}

function validFlags(valueFlags, booleanFlags) {
  return [...new Set([...valueFlags, ...booleanFlags])].sort().join(", ");
}

function flagName(rawName) {
  return rawName.slice(2).replaceAll("-", "_");
}

function buildContext(flags) {
  return { cwd: path.resolve(flags.cwd ?? process.cwd()), namespace: flags.namespace };
}

function nsArgs(context) {
  return context.namespace ? ["-n", context.namespace] : [];
}

function home(_parsed, context) {
  const state = clusterState(context);
  const targets = discoverTargets(context);
  const rows = targets.slice(0, 8).map((target) => ({ id: target.id, type: target.type, source: displayPath(target.path, context.cwd), detail: target.detail ?? target.reason ?? "" }));
  const lines = [
    `bin: ${toonScalar(collapseHome(process.argv[1]))}`,
    `description: ${toonScalar(DESCRIPTION)}`,
    `version: ${VERSION}`,
    "kubernetes:",
    `  kubectl: ${state.kubectl}`,
    `  cluster: ${state.cluster}`,
    `  context: ${toonScalar(state.context)}`,
    `  namespace: ${toonScalar(state.namespace)}`,
    `  client: ${toonScalar(state.client)}`,
    `  server: ${toonScalar(state.server)}`,
    "counts:",
    `  nodes: ${state.nodes}`,
    `  deployments: ${state.deployments}`,
    `  pods: ${state.pods}`,
    `  pods_ready: ${state.podsReady}`,
    `  pods_not_ready: ${state.podsNotReady}`,
    `targets_count: ${targets.length}`
  ];
  if (rows.length === 0) lines.push("targets: 0 Kubernetes targets detected in this workspace");
  else lines.push(formatTable("targets", rows, ["id", "type", "source", "detail"]));
  const help = ["Run `kubernetes-axi doctor` to check cluster readiness", "Run `kubernetes-axi discover --full` to inspect Kubernetes targets"];
  if (targets.length > 0) help.push("Run `kubernetes-axi plan --target <id> --environment <name>` before mutating");
  else help.push("Run `kubernetes-axi recommend --goal deploy` to choose a Kubernetes path");
  lines.push(formatHelp(help));
  print(lines.join("\n"));
}

function doctor(_parsed, context) {
  const kubectlPath = findExecutable("kubectl");
  const version = kubectlPath ? runKubectl(["version", "-o", "json"], context) : { status: 127, stdout: "", stderr: "kubectl not found" };
  const auth = kubectlPath ? runKubectl(["auth", "can-i", "get", "pods", ...nsArgs(context)], context) : { status: 127, stdout: "", stderr: "" };
  const metrics = kubectlPath ? runKubectl(["top", "nodes"], context) : { status: 127, stdout: "", stderr: "" };
  const helmPath = findExecutable("helm");
  const kustomizePath = findExecutable("kustomize");
  const state = clusterState(context);
  const skew = versionSkew(version.stdout);
  const rows = [
    { check: "kubectl", status: kubectlPath ? "ok" : "missing", detail: kubectlPath ? collapseHome(kubectlPath) : "install kubectl" },
    { check: "cluster", status: state.cluster === "ok" ? "ok" : "error", detail: state.cluster === "ok" ? "reachable" : truncate(sanitize(state.clusterDetail || "unreachable"), 160).text },
    { check: "context", status: state.context ? "ok" : "missing", detail: state.context || "no current context" },
    { check: "auth", status: auth.status === 0 && /yes/i.test(auth.stdout) ? "ok" : auth.status === 0 ? "denied" : "error", detail: truncate(sanitize(auth.stdout || auth.stderr || "auth check failed"), 120).text },
    { check: "namespace", status: "ok", detail: state.namespace || "default" },
    { check: "version-skew", status: skew.status, detail: skew.detail },
    { check: "metrics", status: metrics.status === 0 ? "ok" : "missing", detail: metrics.status === 0 ? "metrics-server available" : "kubectl top unavailable" },
    { check: "helm", status: helmPath ? "ok" : "optional", detail: helmPath ? collapseHome(helmPath) : "install helm for chart workflows" },
    { check: "kustomize", status: kustomizePath || kubectlPath ? "ok" : "optional", detail: kustomizePath ? collapseHome(kustomizePath) : kubectlPath ? "kubectl kustomize available" : "install kustomize" }
  ];
  print([
    `summary: ${kubectlPath && state.cluster === "ok" ? "ready" : "attention-required"}`,
    formatTable("checks", rows, ["check", "status", "detail"]),
    formatHelp(["Run `kubernetes-axi discover` to list Kubernetes targets", "Run `kubernetes-axi services` to inspect supported domains"])
  ].join("\n"));
}

function services(parsed) {
  const fields = parseFields(parsed.flags.fields, ["capability", "domain", "use"], ["capability", "domain", "use"]);
  const rows = SERVICE_DOMAINS.filter((row) => !parsed.flags.capability || row.capability === parsed.flags.capability).map((row) => pick(row, fields));
  const lines = [`count: ${rows.length} of ${SERVICE_DOMAINS.length} Kubernetes domains`];
  if (rows.length === 0) lines.push(`services: 0 Kubernetes domains found for ${toonScalar(parsed.flags.capability)}`);
  else lines.push(formatTable("services", rows, fields));
  lines.push(formatHelp(["Run `kubernetes-axi recommend --goal <deploy|debug|rollout|scale|expose|local-dev|helm|kustomize|cleanup|managed>` for workflow paths"]));
  print(lines.join("\n"));
}

function discover(parsed, context) {
  const fields = parseFields(parsed.flags.fields, ["id", "type", "source", "detail"], ["id", "type", "source", "detail", "kind", "reason"]);
  const targets = discoverTargets(context);
  const rows = targets.map((target) => {
    const row = { ...target, source: displayPath(target.path, context.cwd) };
    if (!parsed.flags.full) {
      row.reason = truncate(row.reason ?? "", 120).text;
      row.detail = truncate(row.detail ?? "", 120).text;
    }
    return pick(row, fields);
  });
  const lines = [`count: ${rows.length} Kubernetes targets detected`];
  if (rows.length === 0) lines.push("targets: 0 Kubernetes targets detected in this workspace");
  else lines.push(formatTable("targets", rows, fields));
  lines.push(formatHelp(["Run `kubernetes-axi plan --target <id> --environment <name>` before mutating", "Run `kubernetes-axi recommend --goal deploy` if no target matches the app"]));
  print(lines.join("\n"));
}

function recommend(parsed) {
  const goal = parsed.flags.goal;
  const goals = Object.keys(RECOMMENDATIONS).join("|");
  if (!goal) usageError("--goal is required", [`Run \`kubernetes-axi recommend --goal <${goals}>\``]);
  const rows = RECOMMENDATIONS[goal];
  if (!rows) usageError(`unknown goal ${toonScalar(goal)}`, [`valid goals: ${Object.keys(RECOMMENDATIONS).join(", ")}`]);
  print([
    `goal: ${goal}`,
    formatTable("paths", rows.map(([id, pattern, fit, command]) => ({ id, pattern, fit, command })), ["id", "pattern", "fit", "command"]),
    formatHelp(["Run the suggested command for the path that best matches the app"])
  ].join("\n"));
}

function list(parsed, context) {
  const kind = parsed.flags.kind ?? "pods";
  const limit = parsed.flags.limit ? parsePositiveInteger(parsed.flags.limit, "--limit") : 50;
  const fields = parseFields(parsed.flags.fields, defaultListFields(kind), allowedListFields(kind));
  ensureKubectl();
  const args = ["get", kind, "-o", "json", ...nsArgs(context), ...(parsed.flags.selector ? ["-l", parsed.flags.selector] : [])];
  const result = runKubectl(args, context);
  if (result.status !== 0) runtimeError("kubectl get failed", [sanitize(result.stderr || result.stdout)]);
  const items = parseJson(result.stdout)?.items ?? [];
  const rows = items.slice(0, limit).map((item) => pick(resourceRow(kind, item), fields));
  const lines = [`count: ${rows.length} of ${items.length} total`];
  if (rows.length === 0) lines.push(`${kind}: 0 resources found`);
  else lines.push(formatTable(kind.replaceAll("/", "_"), rows, fields));
  if (items.length > limit) lines.push(formatHelp([`Run \`kubernetes-axi list --kind ${kind} --limit ${items.length}\` for all ${items.length} items`]));
  print(lines.join("\n"));
}

function inspect(parsed, context) {
  const kind = parsed.flags.kind;
  const name = parsed.flags.name;
  if (!kind) usageError("--kind is required", ["Run `kubernetes-axi inspect --kind <pod|deployment|service|...> --name <name>`"]);
  if (!name) usageError("--name is required", ["Run `kubernetes-axi inspect --kind <kind> --name <name>`"]);
  ensureKubectl();
  if (/^secrets?(\.|$)/i.test(kind)) {
    // Secrets are redacted structurally, not by pattern: only key NAMES are shown. (The YAML also repeats the whole
    // secret in the last-applied-configuration annotation, which regex redaction can miss.)
    const secretResult = runKubectl(["get", kind, name, "-o", "json", ...nsArgs(context)], context);
    if (secretResult.status !== 0) runtimeError("kubectl get failed", [sanitize(secretResult.stderr || secretResult.stdout)]);
    const secret = parseJson(secretResult.stdout) ?? {};
    const safe = {
      apiVersion: secret.apiVersion,
      kind: secret.kind,
      metadata: { name: secret.metadata?.name, namespace: secret.metadata?.namespace, labels: secret.metadata?.labels, creationTimestamp: secret.metadata?.creationTimestamp },
      type: secret.type,
      keys: Object.keys({ ...(secret.data ?? {}), ...(secret.stringData ?? {}) }),
      note: "secret values are never shown"
    };
    print(["inspect:", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  output: ${toonScalar(JSON.stringify(safe))}`].join("\n"));
    return;
  }
  const result = runKubectl(["get", kind, name, "-o", "yaml", ...nsArgs(context)], context);
  if (result.status !== 0) runtimeError("kubectl get failed", [sanitize(result.stderr || result.stdout)]);
  const sanitized = sanitize(result.stdout);
  if (parsed.flags.full) {
    print(["inspect:", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  output: ${toonScalar(sanitized)}`].join("\n"));
    return;
  }
  const preview = truncate(sanitized, PREVIEW_LIMIT);
  const lines = ["inspect:", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  preview: ${toonScalar(preview.text)}`];
  if (preview.truncated) lines.push(formatHelp([`Run \`kubernetes-axi inspect --kind ${kind} --name ${name} --full\` for complete sanitized output`]));
  print(lines.join("\n"));
}

function logs(parsed, context) {
  const pod = parsed.flags.pod;
  if (!pod) usageError("--pod is required", ["Run `kubernetes-axi logs --pod <name> [--container <name>] [--tail 100]`"]);
  const tail = parsePositiveInteger(parsed.flags.tail ?? "100", "--tail");
  ensureKubectl();
  const args = ["logs", pod, `--tail=${tail}`, ...nsArgs(context), ...(parsed.flags.container ? ["-c", parsed.flags.container] : [])];
  const result = runKubectl(args, context);
  if (result.status !== 0) runtimeError("kubectl logs failed", [sanitize(result.stderr || result.stdout)]);
  const sanitized = sanitize(result.stdout || result.stderr);
  const body = parsed.flags.full ? sanitized : truncate(sanitized, LOG_LIMIT).text;
  const lines = ["logs:", `  pod: ${toonScalar(pod)}`, `  tail: ${tail}`, `  output: ${toonScalar(body)}`];
  if (!parsed.flags.full && truncate(sanitized, LOG_LIMIT).truncated) lines.push(formatHelp([`Run \`kubernetes-axi logs --pod ${pod} --tail ${tail} --full\` for complete output`]));
  print(lines.join("\n"));
}

function events(parsed, context) {
  const limit = parsed.flags.limit ? parsePositiveInteger(parsed.flags.limit, "--limit") : 20;
  ensureKubectl();
  const result = runKubectl(["get", "events", "--sort-by=.lastTimestamp", "-o", "json", ...nsArgs(context)], context);
  if (result.status !== 0) runtimeError("kubectl get events failed", [sanitize(result.stderr || result.stdout)]);
  const items = (parseJson(result.stdout)?.items ?? []).slice(-limit).reverse();
  const rows = items.map((item) => ({
    type: item.type ?? "",
    reason: item.reason ?? "",
    object: item.involvedObject?.name ?? "",
    message: truncate(sanitize(item.message ?? ""), parsed.flags.full ? 10000 : 160).text
  }));
  const lines = [`count: ${rows.length} events`];
  if (rows.length === 0) lines.push("events: 0 events found");
  else lines.push(formatTable("events", rows, ["type", "reason", "object", "message"]));
  if (!parsed.flags.full) lines.push(formatHelp(["Run `kubernetes-axi events --full` for longer event messages"]));
  print(lines.join("\n"));
}

function plan(parsed, context) {
  const target = requireTarget(parsed, context);
  const environment = parsed.flags.environment ?? "local";
  print(buildPlan(target, environment, parsed.flags, context));
}

function apply(parsed, context) {
  const environment = parsed.flags.environment ?? "local";
  let command;
  let targetId = parsed.flags.target ?? parsed.flags.file ?? "";
  if (parsed.flags.file) {
    const file = path.resolve(context.cwd, parsed.flags.file);
    command = { cmd: "kubectl", args: ["apply", "-f", file, ...nsArgs(context)] };
    targetId = displayPath(file, context.cwd);
  } else {
    const target = requireTarget(parsed, context);
    targetId = target.id;
    command = applyCommand(target, environment, context);
  }
  if (!command) runtimeError(`target ${toonScalar(targetId)} does not have an executable apply command`, ["Use `kubernetes-axi plan --target <id>` or pass --file"]);
  if (!parsed.flags.execute) {
    print([
      "apply:",
      "  dry_run: true",
      `  target: ${toonScalar(targetId)}`,
      `  environment: ${toonScalar(environment)}`,
      `  command: ${toonScalar(formatCommand(command))}`,
      formatHelp([`Run \`kubernetes-axi apply --target ${targetId} --environment ${environment} --execute\` to execute after review`])
    ].join("\n"));
    return;
  }
  ensureKubectl();
  const result = runCommand(command.cmd, command.args, commandContext(command, context), command.timeout);
  if (result.status !== 0) runtimeError("kubernetes apply command failed", [sanitize(result.stderr || result.stdout || "Run `kubernetes-axi doctor` and retry")]);
  print(["apply:", "  dry_run: false", `  target: ${toonScalar(targetId)}`, `  environment: ${toonScalar(environment)}`, `  command: ${toonScalar(formatCommand(command))}`, `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`].join("\n"));
}

function deleteResource(parsed, context) {
  const kind = parsed.flags.kind;
  const name = parsed.flags.name;
  if (!kind) usageError("--kind is required", ["Run `kubernetes-axi delete --kind <kind> --name <name> --confirm <name>`"]);
  if (!name) usageError("--name is required", ["Run `kubernetes-axi delete --kind <kind> --name <name> --confirm <name>`"]);
  if (parsed.flags.confirm !== name) usageError("destructive delete requires --confirm matching --name", [`Run \`kubernetes-axi delete --kind ${kind} --name ${name} --confirm ${name}\` after review`]);
  const command = { cmd: "kubectl", args: ["delete", kind, name, ...nsArgs(context)] };
  if (!parsed.flags.execute) {
    print(["delete:", "  dry_run: true", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  command: ${toonScalar(formatCommand(command))}`, formatHelp([`Run \`kubernetes-axi delete --kind ${kind} --name ${name} --confirm ${name} --execute\` to delete after review`])].join("\n"));
    return;
  }
  ensureKubectl();
  const result = runKubectl(command.args, context);
  if (result.status !== 0) runtimeError("kubectl delete failed", [sanitize(result.stderr || result.stdout)]);
  print(["delete:", "  dry_run: false", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`].join("\n"));
}

function rolloutStatus(parsed, context) {
  const kind = parsed.flags.kind ?? "deployment";
  const name = parsed.flags.name;
  if (!name) usageError("--name is required", ["Run `kubernetes-axi rollout status --name <deployment>`"]);
  ensureKubectl();
  const result = runKubectl(["rollout", "status", `${kind}/${name}`, ...nsArgs(context)], context);
  if (result.status !== 0) runtimeError("kubectl rollout status failed", [sanitize(result.stderr || result.stdout)]);
  print(["rollout_status:", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`].join("\n"));
}

function rolloutRestart(parsed, context) {
  const kind = parsed.flags.kind ?? "deployment";
  const name = parsed.flags.name;
  if (!name) usageError("--name is required", ["Run `kubernetes-axi rollout restart --name <deployment>`"]);
  const command = { cmd: "kubectl", args: ["rollout", "restart", `${kind}/${name}`, ...nsArgs(context)] };
  if (!parsed.flags.execute) {
    print(["rollout_restart:", "  dry_run: true", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  command: ${toonScalar(formatCommand(command))}`, formatHelp(["Add `--execute` to restart after review"])].join("\n"));
    return;
  }
  ensureKubectl();
  const result = runKubectl(command.args, context);
  if (result.status !== 0) runtimeError("kubectl rollout restart failed", [sanitize(result.stderr || result.stdout)]);
  print(["rollout_restart:", "  dry_run: false", `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`].join("\n"));
}

function scale(parsed, context) {
  const kind = parsed.flags.kind ?? "deployment";
  const name = parsed.flags.name;
  const replicas = parsed.flags.replicas;
  if (!name) usageError("--name is required", ["Run `kubernetes-axi scale --name <name> --replicas <n>`"]);
  if (replicas === undefined) usageError("--replicas is required", ["Run `kubernetes-axi scale --name <name> --replicas <n>`"]);
  if (!/^\d+$/.test(String(replicas))) usageError("--replicas must be a non-negative integer", ["Run `kubernetes-axi scale --name <name> --replicas 2`"]);
  const command = { cmd: "kubectl", args: ["scale", `${kind}/${name}`, `--replicas=${replicas}`, ...nsArgs(context)] };
  if (!parsed.flags.execute) {
    print(["scale:", "  dry_run: true", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  replicas: ${replicas}`, `  command: ${toonScalar(formatCommand(command))}`, formatHelp(["Add `--execute` to scale after review"])].join("\n"));
    return;
  }
  ensureKubectl();
  const result = runKubectl(command.args, context);
  if (result.status !== 0) runtimeError("kubectl scale failed", [sanitize(result.stderr || result.stdout)]);
  print(["scale:", "  dry_run: false", `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`].join("\n"));
}

function expose(parsed, context) {
  const kind = parsed.flags.kind ?? "deployment";
  const name = parsed.flags.name;
  const port = parsed.flags.port;
  const type = parsed.flags.type ?? "ClusterIP";
  if (!name) usageError("--name is required", ["Run `kubernetes-axi expose --name <name> --port <port>`"]);
  if (!port) usageError("--port is required", ["Run `kubernetes-axi expose --name <name> --port <port>`"]);
  const command = { cmd: "kubectl", args: ["expose", kind, name, `--port=${port}`, `--type=${type}`, ...nsArgs(context)] };
  if (!parsed.flags.execute) {
    print(["expose:", "  dry_run: true", `  kind: ${kind}`, `  name: ${toonScalar(name)}`, `  port: ${port}`, `  type: ${type}`, `  command: ${toonScalar(formatCommand(command))}`, formatHelp(["Add `--execute` to expose after review"])].join("\n"));
    return;
  }
  ensureKubectl();
  const result = runKubectl(command.args, context);
  if (result.status !== 0) runtimeError("kubectl expose failed", [sanitize(result.stderr || result.stdout)]);
  print(["expose:", "  dry_run: false", `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`].join("\n"));
}

function portForward(parsed, context) {
  const resource = parsed.flags.resource;
  const ports = parsed.flags.ports;
  const timeout = parsePositiveInteger(parsed.flags.timeout ?? "5", "--timeout");
  if (!resource) usageError("--resource is required", ["Run `kubernetes-axi port-forward --resource pod/<name> --ports 8080:80`"]);
  if (!ports) usageError("--ports is required", ["Run `kubernetes-axi port-forward --resource pod/<name> --ports 8080:80`"]);
  const command = { cmd: "kubectl", args: ["port-forward", resource, ports, "--address", "127.0.0.1", ...nsArgs(context)], timeout: timeout * 1000 };
  if (!parsed.flags.execute) {
    print(["port_forward:", "  dry_run: true", `  resource: ${toonScalar(resource)}`, `  ports: ${toonScalar(ports)}`, `  timeout_seconds: ${timeout}`, `  command: ${toonScalar(formatCommand(command))}`, formatHelp(["Add `--execute` to run a bounded non-interactive port-forward"])].join("\n"));
    return;
  }
  ensureKubectl();
  const result = runCommand(command.cmd, command.args, context, command.timeout);
  print(["port_forward:", "  dry_run: false", `  resource: ${toonScalar(resource)}`, `  ports: ${toonScalar(ports)}`, `  timeout_seconds: ${timeout}`, `  status: ${result.status === null || result.status === 0 ? "ok" : "ended"}`, `  output: ${toonScalar(truncate(sanitize(result.stdout || result.stderr || "port-forward completed or timed out"), PREVIEW_LIMIT).text)}`].join("\n"));
}

function execPod(parsed, context) {
  const pod = parsed.flags.pod;
  const cmd = parsed.flags.cmd;
  if (!pod) usageError("--pod is required", ["Run `kubernetes-axi exec --pod <name> --cmd -- <argv...>`"]);
  if (!cmd) usageError("--cmd is required", ["Run `kubernetes-axi exec --pod <name> --cmd -- ls /`"]);
  const argv = splitCommand(cmd);
  if (argv.length === 0) usageError("--cmd is required", ["Run `kubernetes-axi exec --pod <name> --cmd -- ls /`"]);
  const args = ["exec", pod, ...nsArgs(context), ...(parsed.flags.container ? ["-c", parsed.flags.container] : []), "--", ...argv];
  const command = { cmd: "kubectl", args };
  if (!parsed.flags.execute) {
    print(["exec:", "  dry_run: true", `  pod: ${toonScalar(pod)}`, `  command: ${toonScalar(formatCommand(command))}`, formatHelp(["Add `--execute` to run this non-interactive command"])].join("\n"));
    return;
  }
  ensureKubectl();
  const result = runKubectl(args, context);
  if (result.status !== 0) runtimeError("kubectl exec failed", [sanitize(result.stderr || result.stdout)]);
  print(["exec:", "  dry_run: false", `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`].join("\n"));
}

function configView(parsed, context) {
  ensureKubectl();
  // No --raw: kubectl itself redacts client keys/tokens, so we never hold the real credentials.
  const result = runKubectl(["config", "view", "--minify"], context);
  if (result.status !== 0) runtimeError("kubectl config view failed", [sanitize(result.stderr || result.stdout)]);
  const sanitized = sanitize(result.stdout);
  const body = parsed.flags.full ? sanitized : truncate(sanitized, PREVIEW_LIMIT).text;
  const lines = ["config_view:", `  output: ${toonScalar(body)}`];
  if (!parsed.flags.full && truncate(sanitized, PREVIEW_LIMIT).truncated) lines.push(formatHelp(["Run `kubernetes-axi config view --full` for complete sanitized kubeconfig"]));
  print(lines.join("\n"));
}

function configNamespace(parsed, context) {
  const namespace = parsed.flags.namespace ?? context.namespace;
  if (!namespace) usageError("--namespace is required", ["Run `kubernetes-axi config namespace --namespace <name>`"]);
  const command = { cmd: "kubectl", args: ["config", "set-context", "--current", `--namespace=${namespace}`] };
  if (!parsed.flags.execute) {
    print(["config_namespace:", "  dry_run: true", `  namespace: ${toonScalar(namespace)}`, `  command: ${toonScalar(formatCommand(command))}`, formatHelp(["Add `--execute` to set the current context namespace"])].join("\n"));
    return;
  }
  ensureKubectl();
  const result = runKubectl(command.args, context);
  if (result.status !== 0) runtimeError("kubectl config set-context failed", [sanitize(result.stderr || result.stdout)]);
  print(["config_namespace:", "  dry_run: false", `  namespace: ${toonScalar(namespace)}`, `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`].join("\n"));
}

function clean(parsed, context) {
  const kind = parsed.flags.kind;
  const commands = {
    pods: ["delete", "pods", "--all", ...nsArgs(context)],
    jobs: ["delete", "jobs", "--all", ...nsArgs(context)],
    "completed-pods": ["delete", "pods", "--field-selector=status.phase==Succeeded", ...nsArgs(context)]
  };
  if (!kind) usageError("--kind is required", ["Run `kubernetes-axi clean --kind <pods|jobs|completed-pods>`"]);
  if (!commands[kind]) usageError(`unknown cleanup kind ${toonScalar(kind)}`, ["valid kinds: pods, jobs, completed-pods"]);
  const command = { cmd: "kubectl", args: commands[kind] };
  if (!parsed.flags.execute) {
    print(["clean:", "  dry_run: true", `  kind: ${kind}`, `  command: ${toonScalar(formatCommand(command))}`, formatHelp([`Run \`kubernetes-axi clean --kind ${kind} --execute\` to clean after review`])].join("\n"));
    return;
  }
  ensureKubectl();
  const result = runKubectl(command.args, context);
  if (result.status !== 0) runtimeError("kubectl cleanup failed", [sanitize(result.stderr || result.stdout)]);
  print(["clean:", "  dry_run: false", `  kind: ${kind}`, `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`].join("\n"));
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
    print(["hooks:", "  dry_run: true", formatTable("files", rows, ["agent", "path", "status"]), formatHelp(["Run `kubernetes-axi hooks install --agent all --scope project --execute` to write hook files"])].join("\n"));
    return;
  }
  for (const row of rows) {
    fs.mkdirSync(path.dirname(row.absolutePath), { recursive: true });
    fs.writeFileSync(row.absolutePath, hookContent(row.agent), "utf8");
  }
  print(formatTable("files", rows.map((row) => ({ agent: row.agent, path: row.path, status: "written" })), ["agent", "path", "status"]));
}

function skillGenerate(parsed, context) {
  const output = path.resolve(context.cwd, parsed.flags.output ?? "SKILL.md");
  const content = skillContent();
  if (parsed.flags.check) {
    const actual = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
    if (actual !== content) runtimeError("generated skill is stale or missing", [`Run \`kubernetes-axi skill generate --output ${displayPath(output, context.cwd)}\``], 1);
    print("skill: up-to-date");
    return;
  }
  fs.writeFileSync(output, content, "utf8");
  print(["skill:", `  path: ${toonScalar(displayPath(output, context.cwd))}`, "  status: written"].join("\n"));
}

function requireTarget(parsed, context) {
  const id = parsed.flags.target;
  if (!id) usageError("--target is required", ["Run `kubernetes-axi discover` to find target ids"]);
  const target = discoverTargets(context).find((item) => item.id === id);
  if (!target) usageError(`target ${toonScalar(id)} was not found`, ["Run `kubernetes-axi discover` to find target ids"]);
  return target;
}

function buildPlan(target, environment, flags, context) {
  const command = planCommand(target, environment, context);
  const rows = [
    { check: "target", status: "ok", detail: target.id },
    { check: "environment", status: "ok", detail: environment },
    { check: "kubectl", status: findExecutable("kubectl") ? "ok" : "missing", detail: findExecutable("kubectl") ? collapseHome(findExecutable("kubectl")) : "install kubectl" },
    { check: "secrets", status: "redacted", detail: "secret data env kubeconfig tokens certs logs inspect" }
  ];
  const lines = ["plan:", `  target: ${toonScalar(target.id)}`, `  type: ${toonScalar(target.type)}`, `  environment: ${toonScalar(environment)}`, `  command: ${toonScalar(command ? formatCommand(command) : "manual review required")}`, formatTable("checks", rows, ["check", "status", "detail"])];
  if (command?.preview) {
    const result = runCommand(command.cmd, command.args, commandContext(command, context));
    lines.push("preview:");
    lines.push(`  status: ${result.status === 0 ? "ok" : "error"}`);
    lines.push(`  output: ${toonScalar(flags.full ? sanitize(result.stdout || result.stderr) : truncate(sanitize(result.stdout || result.stderr), PREVIEW_LIMIT).text)}`);
  }
  lines.push(formatHelp([`Run \`kubernetes-axi apply --target ${target.id} --environment ${environment}\` to see the guarded apply command`]));
  return lines.join("\n");
}

function planCommand(target, environment, context) {
  if (target.commands?.plan) return { ...expandCommand(target.commands.plan, environment, target.path), preview: true };
  if (target.type === "helm") return { cmd: "helm", args: ["template", path.basename(path.dirname(target.path)), path.dirname(target.path)], cwd: context.cwd, preview: true };
  if (target.type === "kustomize") return { cmd: "kubectl", args: ["kustomize", path.dirname(target.path)], cwd: context.cwd, preview: true };
  if (target.type === "manifest" || target.type === "manifests-dir") return { cmd: "kubectl", args: ["apply", "--dry-run=client", "-f", target.path, ...nsArgs(context)], preview: true };
  if (target.type === "custom" && target.commands?.apply) return expandCommand(target.commands.apply, environment, target.path);
  return null;
}

function applyCommand(target, environment, context) {
  if (target.commands?.apply) return expandCommand(target.commands.apply, environment, target.path);
  if (target.type === "helm") return { cmd: "helm", args: ["upgrade", "--install", path.basename(path.dirname(target.path)), path.dirname(target.path)], cwd: context.cwd };
  if (target.type === "kustomize") return { cmd: "kubectl", args: ["apply", "-k", path.dirname(target.path), ...nsArgs(context)] };
  if (target.type === "manifest" || target.type === "manifests-dir") return { cmd: "kubectl", args: ["apply", "-f", target.path, ...nsArgs(context)] };
  return null;
}

function expandCommand(command, environment, cwd) {
  const [cmd, ...args] = command.map((part) => String(part).replaceAll("${environment}", environment));
  return { cmd, args, cwd: cwd && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory() ? cwd : path.dirname(cwd) };
}

function discoverTargets(context) {
  const targets = [];
  targets.push(...customTargets(context));
  for (const file of findFiles(context.cwd, isYamlFile, 3)) {
    const base = path.basename(file).toLowerCase();
    if (base === "kustomization.yaml" || base === "kustomization.yml") {
      targets.push({ id: `kustomize:${displayPath(path.dirname(file), context.cwd)}`, type: "kustomize", path: file, detail: "kustomization", kind: "Kustomization", reason: "kustomization found" });
      continue;
    }
    if (base === "chart.yaml" || base === "chart.yml") {
      targets.push({ id: `helm:${displayPath(path.dirname(file), context.cwd)}`, type: "helm", path: file, detail: "helm chart", kind: "Chart", reason: "Helm chart found" });
      continue;
    }
    const kinds = parseManifestKinds(file);
    if (kinds.length === 0) continue;
    targets.push({ id: `manifest:${displayPath(file, context.cwd)}`, type: "manifest", path: file, detail: kinds.join("|"), kind: kinds.join("|"), reason: "Kubernetes manifest found" });
  }
  for (const dirName of ["k8s", "manifests", "deploy", "kubernetes"]) {
    const dir = path.join(context.cwd, dirName);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      targets.push({ id: `manifests-dir:${dirName}`, type: "manifests-dir", path: dir, detail: `${dirName} directory`, reason: "manifests directory found" });
    }
  }
  for (const name of ["skaffold.yaml", "skaffold.yml"]) {
    const file = path.join(context.cwd, name);
    if (fs.existsSync(file)) targets.push({ id: `skaffold:${name}`, type: "skaffold", path: file, detail: "skaffold config", reason: "Skaffold config found" });
  }
  const tilt = path.join(context.cwd, "Tiltfile");
  if (fs.existsSync(tilt)) targets.push({ id: "tilt:Tiltfile", type: "tilt", path: tilt, detail: "Tiltfile", reason: "Tilt config found" });
  for (const file of findFiles(context.cwd, isComposeFile, 1)) {
    targets.push({ id: `compose-hint:${displayPath(file, context.cwd)}`, type: "compose-to-k8s", path: file, detail: "compose file", reason: "Compose file may convert to Kubernetes manifests" });
  }
  const ctx = clusterState(context).context.toLowerCase();
  if (/kind|minikube|docker-desktop|desktop-linux/.test(ctx)) {
    targets.push({ id: `local-cluster:${ctx || "local"}`, type: "local-dev", path: context.cwd, detail: ctx, reason: "local cluster context detected" });
  }
  if (/arn:aws:eks|gke_|aks/.test(ctx)) {
    targets.push({ id: `managed-cluster:${ctx}`, type: "managed", path: context.cwd, detail: ctx, reason: "managed cluster context detected; lifecycle is recommend-only" });
  }
  return dedupeTargets(targets);
}

function customTargets(context) {
  const file = path.join(context.cwd, "kubernetes-axi.config.json");
  const config = readJson(file);
  if (!config?.targets || !Array.isArray(config.targets)) return [];
  return config.targets.map((target) => ({
    id: String(target.id),
    type: target.type ?? "custom",
    path: path.resolve(context.cwd, target.path ?? "."),
    detail: target.detail ?? target.type ?? "custom Kubernetes workflow",
    reason: target.reason ?? "kubernetes-axi.config.json target",
    commands: target.commands
  }));
}

function isYamlFile(file) {
  return /\.ya?ml$/i.test(file);
}

function isComposeFile(file) {
  return ["compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml"].includes(path.basename(file));
}

function parseManifestKinds(file) {
  const content = safeRead(file);
  const kinds = [...content.matchAll(/^\s*kind:\s*([A-Za-z0-9]+)\s*$/gim)].map((match) => match[1]);
  const interesting = new Set(["Deployment", "Service", "Ingress", "ConfigMap", "Secret", "StatefulSet", "DaemonSet", "Job", "CronJob", "Kustomization", "Namespace", "HorizontalPodAutoscaler"]);
  return [...new Set(kinds.filter((kind) => interesting.has(kind) || path.basename(file).startsWith("Chart")))];
}

function clusterState(context) {
  const kubectlPath = findExecutable("kubectl");
  if (!kubectlPath) return { kubectl: "missing", cluster: "missing", context: "", namespace: context.namespace || "", client: "", server: "", nodes: 0, deployments: 0, pods: 0, podsReady: 0, podsNotReady: 0, clusterDetail: "kubectl missing" };
  const version = runKubectl(["version", "-o", "json"], context);
  const currentContext = runKubectl(["config", "current-context"], context);
  const ns = context.namespace || runKubectl(["config", "view", "--minify", "-o", "jsonpath={..namespace}"], context).stdout.trim() || "default";
  const nodes = runKubectl(["get", "nodes", "-o", "json"], context);
  const deployments = runKubectl(["get", "deployments", "-o", "json", ...nsArgs({ ...context, namespace: ns === "default" && !context.namespace ? undefined : ns })], context);
  const pods = runKubectl(["get", "pods", "-o", "json", ...(context.namespace ? nsArgs(context) : ns !== "default" ? ["-n", ns] : [])], context);
  const podItems = pods.status === 0 ? (parseJson(pods.stdout)?.items ?? []) : [];
  const ready = podItems.filter((item) => (item.status?.containerStatuses ?? []).every((c) => c.ready) && item.status?.phase === "Running").length;
  const versionJson = parseJson(version.stdout) ?? {};
  return {
    kubectl: "ok",
    cluster: version.status === 0 || currentContext.status === 0 ? (version.status === 0 ? "ok" : "error") : "error",
    clusterDetail: version.stderr || version.stdout,
    context: currentContext.status === 0 ? sanitize(currentContext.stdout).trim() : "",
    namespace: ns,
    client: versionJson.clientVersion?.gitVersion ?? "",
    server: versionJson.serverVersion?.gitVersion ?? "",
    nodes: nodes.status === 0 ? (parseJson(nodes.stdout)?.items ?? []).length : 0,
    deployments: deployments.status === 0 ? (parseJson(deployments.stdout)?.items ?? []).length : 0,
    pods: podItems.length,
    podsReady: ready,
    podsNotReady: Math.max(podItems.length - ready, 0)
  };
}

function versionSkew(stdout) {
  const json = parseJson(stdout);
  if (!json?.clientVersion?.major || !json?.serverVersion?.major) return { status: "unknown", detail: "unable to compare versions" };
  const client = Number(json.clientVersion.major) * 100 + Number(json.clientVersion.minor);
  const server = Number(json.serverVersion.major) * 100 + Number(json.serverVersion.minor);
  const delta = Math.abs(client - server);
  return delta <= 1 ? { status: "ok", detail: `${json.clientVersion.gitVersion} / ${json.serverVersion.gitVersion}` } : { status: "skew", detail: `${json.clientVersion.gitVersion} vs ${json.serverVersion.gitVersion}` };
}

function defaultListFields(kind) {
  if (/pod/i.test(kind)) return ["name", "ready", "status", "restarts", "age"];
  if (/deploy|statefulset|daemonset/i.test(kind)) return ["name", "ready", "up_to_date", "available", "age"];
  if (/service|svc/i.test(kind)) return ["name", "type", "cluster_ip", "ports", "age"];
  return ["name", "kind", "age"];
}

function allowedListFields(kind) {
  return [...new Set([...defaultListFields(kind), "namespace", "labels"])];
}

function resourceRow(kind, item) {
  const name = item.metadata?.name ?? "";
  const age = item.metadata?.creationTimestamp ?? "";
  if (/pod/i.test(kind)) {
    const statuses = item.status?.containerStatuses ?? [];
    const readyCount = statuses.filter((c) => c.ready).length;
    return { name, ready: `${readyCount}/${statuses.length || (item.spec?.containers ?? []).length}`, status: item.status?.phase ?? "", restarts: String(statuses.reduce((sum, c) => sum + (c.restartCount ?? 0), 0)), age, namespace: item.metadata?.namespace ?? "", labels: Object.keys(item.metadata?.labels ?? {}).join("|") };
  }
  if (/deploy|statefulset|daemonset/i.test(kind)) {
    return { name, ready: `${item.status?.readyReplicas ?? 0}/${item.status?.replicas ?? item.spec?.replicas ?? 0}`, up_to_date: String(item.status?.updatedReplicas ?? ""), available: String(item.status?.availableReplicas ?? ""), age, namespace: item.metadata?.namespace ?? "", labels: Object.keys(item.metadata?.labels ?? {}).join("|") };
  }
  if (/service|svc/i.test(kind)) {
    return { name, type: item.spec?.type ?? "", cluster_ip: item.spec?.clusterIP ?? "", ports: (item.spec?.ports ?? []).map((p) => `${p.port}${p.targetPort ? `:${p.targetPort}` : ""}`).join("|"), age, namespace: item.metadata?.namespace ?? "", labels: Object.keys(item.metadata?.labels ?? {}).join("|") };
  }
  return { name, kind: item.kind ?? kind, age, namespace: item.metadata?.namespace ?? "", labels: Object.keys(item.metadata?.labels ?? {}).join("|") };
}

function commandContext(command, context) {
  return command.cwd ? { ...context, cwd: command.cwd } : context;
}

function runKubectl(args, context) {
  return runCommand("kubectl", args, context);
}

function runCommand(cmd, args, context, timeout) {
  const result = spawnSync(cmd, args, { cwd: context.cwd, env: process.env, encoding: "utf8", maxBuffer: 1024 * 1024 * 8, timeout });
  if (result.error && result.error.code !== "ETIMEDOUT") return { status: 127, stdout: "", stderr: result.error.message };
  if (result.error?.code === "ETIMEDOUT") return { status: 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "timed out" };
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function ensureKubectl() {
  if (!findExecutable("kubectl")) runtimeError("kubectl is required", ["Install kubectl or ensure kubectl is on PATH"]);
}

function findExecutable(name) {
  if (name.includes(path.sep)) return fs.existsSync(name) ? name : "";
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }
  return "";
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
    if (seen.has(target.id)) return false;
    seen.add(target.id);
    return true;
  });
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
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

function safeRead(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
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
  if (!Number.isInteger(parsed) || parsed < 1) usageError(`${flag} must be a positive integer`, [`Provide a positive integer for ${flag}`]);
  return parsed;
}

function splitCommand(value) {
  return String(value).match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^["']|["']$/g, "")) ?? [];
}

function pick(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? ""]));
}

function truncate(value, limit) {
  const text = String(value ?? "");
  if (text.length <= limit) return { text, truncated: false, total: text.length };
  return { text: `${text.slice(0, limit)}... (truncated, ${text.length} chars total)`, truncated: true, total: text.length };
}

function sanitize(value) {
  let text = String(value ?? "");
  text = text.replace(/(^\s*(?:data|stringData):\s*$(?:\n(?:[ \t]+.+)*)+)/gim, (block) => block.replace(/^(\s+[A-Za-z0-9_.-]+:\s*).+$/gm, "$1<redacted>"));
  text = text.replace(/((?:client-key-data|client-certificate-data|certificate-authority-data|token):\s*)(\S+)/gi, "$1<redacted>");
  text = text.replace(/("?[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|ACCESS_KEY|PRIVATE_KEY|AUTH)[A-Z0-9_]*"?\s*:\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, "$1\"<redacted>\"");
  text = text.replace(/([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|ACCESS_KEY|PRIVATE_KEY|AUTH)[A-Z0-9_]*)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, "$1$2<redacted>");
  text = text.replace(/((?:token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|auth|bearer)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, "$1<redacted>");
  text = text.replace(/(https?:\/\/)([^:\s/@]+):([^@\s]+)@/gi, "$1<redacted>:<redacted>@");
  text = text.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "<redacted-jwt>");
  text = text.replace(/\b(?:ghp|gho|ghu|ghs|glpat|sk|AKIA)[A-Za-z0-9_=-]{8,}\b/g, "<redacted-token>");
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>");
  return text.trim();
}

function formatCommand(command) {
  return [command.cmd, ...command.args.map((arg) => String(arg).includes(" ") ? `"${String(arg).replaceAll("\"", "\\\"")}"` : String(arg))].join(" ");
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
  return scope === "project" ? path.join(context.cwd, ".opencode", "kubernetes-axi.json") : path.join(os.homedir(), ".config", "opencode", "plugins", "kubernetes-axi.json");
}

function hookContent(agent) {
  const command = hookCommand();
  if (agent === "codex") return `${JSON.stringify({ SessionStart: [{ command }] }, null, 2)}\n`;
  if (agent === "claude") return `${JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command }] }] } }, null, 2)}\n`;
  return `${JSON.stringify({ name: "kubernetes-axi", command }, null, 2)}\n`;
}

function hookCommand() {
  const installed = findExecutable("kubernetes-axi");
  if (installed && path.resolve(installed) === path.resolve(process.argv[1])) return "kubernetes-axi";
  return `${process.execPath} ${process.argv[1]}`;
}

function skillContent() {
  return `---
name: kubernetes-axi
description: Use kubernetes-axi to discover, inspect, deploy, debug, scale, roll out, expose, and clean up Kubernetes workloads through safe TOON CLI workflows.
---

# kubernetes-axi

Use \`kubernetes-axi\` when a task involves kubectl, manifests, Helm, Kustomize, pods, deployments, services, rollouts, logs, events, or cluster debugging.

Run \`kubernetes-axi\` for live context. Use \`kubernetes-axi doctor\` before cluster work. Discover targets with \`kubernetes-axi discover\`. Plan before mutating: \`kubernetes-axi plan --target <id> --environment <name>\`. Mutations require \`--execute\`. Destructive deletes also require \`--confirm <exact-name>\`.
`;
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
  process.stdout.write(`${value}\n`);
}

function helpHome() {
  return [
    `bin: ${toonScalar(collapseHome(process.argv[1]))}`,
    `description: ${toonScalar(DESCRIPTION)}`,
    "commands[22]{name,description}:",
    "  doctor,Check kubectl auth namespace metrics Helm and Kustomize readiness",
    "  services,List Kubernetes capability domains",
    "  discover,Detect manifests Helm charts Kustomize overlays and local cluster hints",
    "  recommend,Suggest Kubernetes workflows for a goal",
    "  list,List cluster resources in compact TOON",
    "  inspect,Summarize redacted resource YAML",
    "  logs,Read truncated redacted pod logs",
    "  events,List recent namespace events",
    "  plan,Run non-mutating preflight for a target",
    "  apply,Apply a target with explicit execution guards",
    "  delete,Delete a named resource with --confirm and --execute",
    "  rollout status,Watch rollout status",
    "  rollout restart,Restart a workload only with --execute",
    "  scale,Scale a workload only with --execute",
    "  expose,Expose a workload only with --execute",
    "  port-forward,Bounded non-interactive port-forward only with --execute",
    "  exec,Run non-interactive pod command only with --execute",
    "  config view,Show sanitized kubeconfig",
    "  config namespace,Set current namespace only with --execute",
    "  clean,Preview or run cleanup workflows",
    "  hooks install,Install session context hooks",
    "  skill generate,Generate installable Agent Skill guidance",
    "examples[3]:",
    "  kubernetes-axi",
    "  kubernetes-axi discover",
    "  kubernetes-axi plan --target <id> --environment local"
  ].join("\n");
}

function helpDoctor() {
  return helpUsage("kubernetes-axi doctor", "Check kubectl auth namespace metrics Helm and Kustomize readiness");
}
function helpServices() {
  return helpUsage("kubernetes-axi services [--capability <name>] [--fields <csv>]", "List Kubernetes capability domains");
}
function helpDiscover() {
  return helpUsage("kubernetes-axi discover [--fields <csv>] [--full]", "Detect Kubernetes targets in the current repo");
}
function helpRecommend() {
  return helpUsage("kubernetes-axi recommend --goal <deploy|debug|rollout|scale|expose|local-dev|helm|kustomize|cleanup|managed>", "Suggest Kubernetes workflow paths");
}
function helpList() {
  return helpUsage("kubernetes-axi list [--kind <kind>] [--fields <csv>] [--selector <label>] [--limit <n>] [--namespace <ns>]", "List cluster resources");
}
function helpInspect() {
  return helpUsage("kubernetes-axi inspect --kind <kind> --name <name> [--namespace <ns>] [--full]", "Summarize redacted resource YAML");
}
function helpLogs() {
  return helpUsage("kubernetes-axi logs --pod <name> [--container <name>] [--tail <n>] [--namespace <ns>] [--full]", "Read redacted truncated pod logs");
}
function helpEvents() {
  return helpUsage("kubernetes-axi events [--limit <n>] [--namespace <ns>] [--full]", "List recent namespace events");
}
function helpPlan() {
  return helpUsage("kubernetes-axi plan --target <id> [--environment <name>] [--full]", "Run non-mutating preflight and command planning");
}
function helpApply() {
  return helpUsage("kubernetes-axi apply [--target <id>|--file <path>] [--environment <name>] [--execute]", "Apply target command only when execution guard is explicit");
}
function helpDelete() {
  return helpUsage("kubernetes-axi delete --kind <kind> --name <name> --confirm <name> [--namespace <ns>] [--execute]", "Delete a named resource with confirm and execute guards");
}
function helpRolloutStatus() {
  return helpUsage("kubernetes-axi rollout status --name <name> [--kind deployment] [--namespace <ns>]", "Watch rollout status");
}
function helpRolloutRestart() {
  return helpUsage("kubernetes-axi rollout restart --name <name> [--kind deployment] [--namespace <ns>] [--execute]", "Restart a workload");
}
function helpScale() {
  return helpUsage("kubernetes-axi scale --name <name> --replicas <n> [--kind deployment] [--namespace <ns>] [--execute]", "Scale a workload");
}
function helpExpose() {
  return helpUsage("kubernetes-axi expose --name <name> --port <port> [--kind deployment] [--type ClusterIP] [--namespace <ns>] [--execute]", "Expose a workload as a Service");
}
function helpPortForward() {
  return helpUsage("kubernetes-axi port-forward --resource <pod/name|svc/name> --ports <local:remote> [--timeout 5] [--namespace <ns>] [--execute]", "Run a bounded non-interactive port-forward");
}
function helpExec() {
  return helpUsage("kubernetes-axi exec --pod <name> --cmd <argv...> [--container <name>] [--namespace <ns>] [--execute]", "Run a non-interactive command in a pod");
}
function helpConfigView() {
  return helpUsage("kubernetes-axi config view [--full]", "Show sanitized kubeconfig");
}
function helpConfigNamespace() {
  return helpUsage("kubernetes-axi config namespace --namespace <name> [--execute]", "Set the current context namespace");
}
function helpClean() {
  return helpUsage("kubernetes-axi clean --kind <pods|jobs|completed-pods> [--namespace <ns>] [--execute]", "Preview or run cleanup workflows");
}
function helpHooksInstall() {
  return helpUsage("kubernetes-axi hooks install [--agent codex|claude|opencode|all] [--scope user|project] [--execute]", "Install or preview session hooks");
}
function helpSkillGenerate() {
  return helpUsage("kubernetes-axi skill generate [--output SKILL.md] [--check]", "Generate or verify installable Agent Skill guidance");
}

function helpUsage(usage, description) {
  return [
    `usage: ${usage}`,
    `description: ${description}`,
    "global_flags[3]{name,default,description}:",
    "  --cwd,\".\",Workspace root",
    "  --namespace,\"\",Kubernetes namespace override",
    "  --help,false,Show this help",
    "examples[2]:",
    `  ${usage.replace(/\s?\[.*?\]/g, "").replace(/<[^>]+>/g, "example")}`,
    "  kubernetes-axi doctor"
  ].join("\n");
}
