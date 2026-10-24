# metabase-axi specs

`specs/` is the source of truth for what `metabase-axi` *should be*. Code is brought
into conformance with these files; spec↔code drift is a bug, not debt. See the
**specops** skill for the full methodology.

## What metabase-axi is

An agent-ergonomic CLI wrapper around the [Metabase](https://www.metabase.com/) API,
part of the `*-axi` tool family (see `gh-axi`, `slack-axi`, `gws-axi`, `harvest-axi`).
It lets an agent (or human) **query and explore** a Metabase instance from the terminal
with token-efficient [TOON](https://toonformat.dev/) output — run SQL/MBQL, execute saved
questions, introspect schema, search content, and browse dashboards/collections.

The MVP leads with the **analyst** surface (querying & exploration). Instance operations
(users, permissions, settings) and content authoring (creating cards/dashboards) are
mapped as later tiers — see [architecture.md](architecture.md#command-surface--roadmap).

## Directory layout

```
specs/
├── README.md            # this file
├── principles.md        # decisive cross-cutting rules (the philosophy, written down)
├── architecture.md      # tech stack, project layout, command surface & roadmap
├── data-model.md        # Metabase entity glossary + result shapes
├── api/
│   └── conventions.md    # base URL, auth, error envelope, query/export contracts
├── behaviors/           # cross-cutting rules spanning multiple commands
│   ├── instance-resolution.md
│   ├── credential-resolution.md
│   ├── output-rendering.md
│   └── result-export-and-truncation.md
└── commands/            # one file per CLI command (the analog of "screens")
    ├── home.md
    ├── auth.md
    ├── doctor.md
    ├── setup.md
    ├── query.md
    ├── card.md
    ├── database.md
    ├── search.md
    ├── dashboard.md
    └── collection.md
```

Because metabase-axi is a CLI, not a GUI, the `screens/` directory from the generic
specops layout is realized here as `commands/` — one spec per command, covering its
invocation, inputs, output, actions, and the next-step suggestions it emits.

## Conventions

- **Commands** declare invocation shape, arguments/flags, what data they fetch (which
  API endpoint), the output schema (TOON blocks), mutations (if any), and the `help[]`
  suggestions they emit. They answer *what*, never *how* (no widget/file/variable detail).
- **Behaviors** define rules shared across commands (instance/credential resolution,
  output rendering, truncation/export). A command spec references the behavior rather
  than restating it.
- **api/conventions.md** is the contract with the Metabase server — the request/response
  shapes commands depend on.
- **principles.md** holds the decisive trade-offs. A principle local to one command lives
  in that command spec's `## Principles` section; promote to `principles.md` once it
  governs more than one.

## Workflow

Spec first, then code. To add or change a command: update its spec (and any behavior/api
spec it touches), get it accepted, then bring code into conformance, then verify against
the spec. Work-in-flight is tracked in `plans/` (see `plans/README.md`).
