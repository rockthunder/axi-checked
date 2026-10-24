# Principles

The project's philosophy, written down as decisive rules. Each picks a side of a real
trade-off so an implementer can resolve an unspecified case the way the author would.
Feature specs reference the ones that bite on them from their own `## Principles` sections.

## Read-first, mutation-explicit

metabase-axi is an **analyst's** tool first: the overwhelmingly common operation is
reading — running a query, inspecting a card, browsing schema. Reads are always safe to
run and never require a confirmation step. Mutations (creating/editing cards, dashboards,
collections, users, settings) are the exception, not the default, and must be explicit:
they require an explicitly resolved instance (never an inferred default when ambiguous —
see [Never guess which instance](#never-guess-which-instance)) and must be idempotent
where the API allows. When read and write ergonomics conflict, optimize for the reader.

> Why: this mirrors actual usage — the daily driver is getting answers out of Metabase,
> not changing it. A tool that makes reads frictionless and writes deliberate matches how
> the instance is actually used and prevents a stray command from mutating a shared,
> production analytics instance.

## Never guess which instance

A Metabase deployment is shared and often a production analytics instance.
The tool targets instances by **named profile**, with env-var override for CI/cron. When
the target is ambiguous for a **mutating or potentially expensive** operation and no
profile is explicitly selected (flag, env, or a single configured profile), the tool
**stops and asks** rather than picking a default. Read-only commands may fall back to the
configured default profile, but always **echo the resolved instance** in their output so
the operator can catch a wrong-target mistake.

> Why: the cost of accidentally running a heavy native query — or a mutation — against
> prod instead of staging is high and silent. Borrowed from slack-axi's habit of echoing
> the resolved range back so wrong-target bugs surface immediately. See
> [instance-resolution](behaviors/instance-resolution.md).

## Tokens are the budget

Output is consumed by an agent with a finite context window. Every field costs tokens.
Default to TOON, compact schemas (3–5 columns per list row), relative timestamps,
pre-computed aggregates over raw dumps, and hard row/char caps with an explicit
truncation marker and a `help[]` line for retrieving more. Never silently truncate —
a cap that isn't announced reads as "this is everything" when it isn't.

> Why: the whole point of an `*-axi` tool over the raw API is fitting useful answers into
> an agent turn. See [output-rendering](behaviors/output-rendering.md) and
> [result-export-and-truncation](behaviors/result-export-and-truncation.md).

## Schema before query

An agent cannot write a correct query against tables and fields it cannot see. Schema
introspection (databases → tables → fields, with types) is a **first-class, Tier-1
capability**, not an afterthought — this is the single biggest gap in the MCP server this
tool supersedes. Querying and schema discovery are designed together: query output
includes column types, and discovery output is shaped to be directly usable for writing
the next query.

> Why: the most common failure mode of "query Metabase from an agent" is guessing column
> names. Making structure visible up front removes the guesswork.

## Preview to stdout, full data to a file

When a command can return more data than fits an agent turn, stdout gets a small,
capped, agent-readable **preview**; the **full raw payload goes to a file** on request
(`--json-out`/`--csv-out`/`--xlsx-out`), and `help[]` points a `jq` example at it. metabase-axi never
offers a `--json`-to-stdout dump. The preview is for *deciding* (is this the right data,
what are the columns); the file is the source of truth for *follow-up* processing. Export format is selected by an
explicit per-format flag (`--json-out`/`--csv-out`/`--xlsx-out`) — never inferred from a
path extension or a `--format` selector.

> Why: this is the design stance worked out for data-returning AXI tools in
> [kunchenguid/axi#32](https://github.com/kunchenguid/axi/issues/32) — `--json`-to-stdout
> fights AXI's STDOUT/STDERR ergonomics, while a side-channel file keeps the agent-optimized
> output intact and gives agents a clean handle for `jq`/script follow-up (the need
> evidenced by agents resorting to `head`/`awk` on TOON in #35). metabase-axi is the
> canonical data-returning tool, so this is core here, not an optional add-on. See
> [result-export-and-truncation](behaviors/result-export-and-truncation.md).

## Surface the contract, don't hide Metabase

The tool is a thin, faithful lens over Metabase — not a re-abstraction of it. Use
Metabase's own vocabulary (card, dashboard, collection, database, MBQL, native) and its
real IDs. Echo back what was resolved and what the server reported: the instance, the
database, the row count, the execution time, whether results were truncated, whether a
query errored. Translate raw API errors into actionable `AxiError`s with suggestions, but
never invent or obscure the underlying model.

> Why: users and agents who know Metabase should find the tool predictable, and those who
> don't should be learning the real model, not a leaky alias for it.
