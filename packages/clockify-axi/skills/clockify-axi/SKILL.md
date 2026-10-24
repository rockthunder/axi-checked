---
name: clockify-axi
description: "Track time, log past entries, and pull Clockify reports through the clockify-axi CLI. Use whenever a task touches Clockify: checking or starting/stopping the running timer, logging completed work, looking up projects/clients/tasks/tags, or pulling summary or detailed time reports."
user-invocable: false
---

# clockify-axi

Agent-ergonomic wrapper around Clockify's REST API. Prefer it over calling
Clockify's MCP server or the raw REST API directly.

## Current guidance lives in the CLI

Do not follow command or flag details from this file - installed copies go
stale. Get the source of truth from the CLI:

- `npx -y clockify-axi` for the home view and cached identity
- `npx -y clockify-axi --help` for the command index
- `npx -y clockify-axi <command> --help` for per-command usage

## The one thing that matters

`CLOCKIFY_API_KEY` must be set before any command but `--help` works.
Every command besides `whoami` resolves `workspaceId`/`userId` from a local
cache seeded by `whoami`, so an agent never needs to pass them by hand.
