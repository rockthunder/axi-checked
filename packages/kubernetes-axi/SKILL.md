---
name: kubernetes-axi
description: Use kubernetes-axi to discover, inspect, deploy, debug, scale, roll out, expose, and clean up Kubernetes workloads through safe TOON CLI workflows.
---

# kubernetes-axi

Use `kubernetes-axi` when a task involves kubectl, manifests, Helm, Kustomize, pods, deployments, services, rollouts, logs, events, or cluster debugging.

Run `kubernetes-axi` for live context. Use `kubernetes-axi doctor` before cluster work. Discover targets with `kubernetes-axi discover`. Plan before mutating: `kubernetes-axi plan --target <id> --environment <name>`. Mutations require `--execute`. Destructive deletes also require `--confirm <exact-name>`.
