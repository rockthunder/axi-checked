> **Vetted copy** of [thatdudealso/kubernetes-axi](https://github.com/thatdudealso/kubernetes-axi) at commit `c05c686`. This README is the upstream text; behaviour differs where this repo patched it - see [`SECURITY-REVIEW.md`](../../SECURITY-REVIEW.md) and [`SOURCES.md`](../../SOURCES.md). Original: [thatdudealso/kubernetes-axi README](https://github.com/thatdudealso/kubernetes-axi/blob/c05c686e02cb0074ccf1ba5284d2941c05e9a54e/README.md).

# kubernetes-axi

Agent-facing Kubernetes operations AXI for discovering, inspecting, deploying,
debugging, scaling, rolling out, exposing, and cleaning up Kubernetes workloads
through safe token-efficient CLI workflows.

The project follows the AXI creation guidelines installed with
`npx skills add kunchenguid/axi`.

## Goals

- Show useful live Kubernetes context with `kubernetes-axi`, not help text.
- Use compact TOON-style stdout for agent parsing.
- Keep every command non-interactive.
- Fail loudly on unknown flags before side effects.
- Default to read-only discovery, planning, or dry-run behavior.
- Require `--execute` for mutations and cleanup.
- Require `--confirm <exact-name>` plus `--execute` for deletes.
- Truncate long logs, events, and YAML by default.
- Redact secrets, tokens, kubeconfig credentials, and secret-like values.

## Usage

```sh
npm test
./bin/kubernetes-axi.js
./bin/kubernetes-axi.js doctor
./bin/kubernetes-axi.js services
./bin/kubernetes-axi.js discover
./bin/kubernetes-axi.js recommend --goal deploy
./bin/kubernetes-axi.js list --kind pods
./bin/kubernetes-axi.js plan --target <id> --environment local
./bin/kubernetes-axi.js apply --target <id> --execute
./bin/kubernetes-axi.js delete --kind deployment --name <name> --confirm <name> --execute
./bin/kubernetes-axi.js clean --kind completed-pods
```

Mutating operations are dry-run by default. Add `--execute` only after reviewing
the generated command and preflight output. Deletes also need
`--confirm <exact-name>`.

## Kubernetes Domains

- Discover: manifests, Helm charts, Kustomize overlays, Skaffold/Tilt, compose hints
- Deploy: plan/apply for manifests, Helm, Kustomize, and custom targets
- Debug: logs, events, inspect, non-interactive exec
- Rollout: status and restart with execution guards
- Scale / expose: replicas, Services, bounded port-forward
- Config: sanitized kubeconfig view and namespace switching
- Cleanup: guarded delete and completed-pod/job cleanup
- Local dev: kind, minikube, Docker Desktop Kubernetes hints
- Managed: EKS/GKE/AKS detection and recommendations only (no provision/delete)
- Security: secret redaction across manifests, logs, describe, and kubeconfig

## Custom Targets

`kubernetes-axi.config.json` can define project-specific workflows:

```json
{
  "targets": [
    {
      "id": "api",
      "type": "custom",
      "path": ".",
      "detail": "repo-specific deploy",
      "commands": {
        "plan": ["kubectl", "diff", "-f", "k8s"],
        "apply": ["kubectl", "apply", "-f", "k8s"]
      }
    }
  ]
}
```

Command templates may use `${environment}`. Do not put secrets in command
templates. Provider lifecycle stays in custom targets or recommendations, not
built-in provision/delete commands.

## Hooks and Skill

Install ambient session context hooks after explicit opt-in:

```sh
kubernetes-axi hooks install --agent all --scope project --execute
```

Generate or verify installable skill guidance:

```sh
kubernetes-axi skill generate
kubernetes-axi skill generate --check
```

## AXI Catalog Entry

The upstream `kunchenguid/axi` community catalog entry should be:

- AXI: `kubernetes-axi`
- Author: `thatdudealso`
- Domain: `Kubernetes`
- Description: `Discover, inspect, deploy, debug, scale, roll out, expose, and clean up Kubernetes workloads through safe token-efficient CLI workflows.`
- Link: `https://github.com/thatdudealso/kubernetes-axi`
