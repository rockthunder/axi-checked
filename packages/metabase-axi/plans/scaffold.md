---
status: done
depends: []
specs:
  - specs/architecture.md
  - specs/README.md
issues: []
---

# Plan: Project scaffold

## Scope

Stand up the empty-but-runnable `metabase-axi` package matching the `*-axi` family layout.
In: `package.json`, `tsconfig.json`, `.tool-versions`, `bin/metabase-axi.ts`, `src/cli.ts`
(`runAxiCli` wiring + `TOP_HELP`), `src/meta.ts`, command-stub registration, build/test
scripts, `README.md`, `LICENSE`. Out: real command logic (later plans), API client
(`config-and-auth`), output helpers (`output-foundation`).

## Implements

- `specs/architecture.md` — tech stack, project layout, CLI shape (`runAxiCli` options),
  the command surface registration (stubs returning a "not implemented" notice).

## Approach

1. `package.json`: `type: module`, `bin`, deps `axi-sdk-js@^0.1.7` + `@toon-format/toon`,
   dev deps `typescript`/`vitest`/`@types/node`; scripts `build`/`dev`/`test` per family.
2. `.tool-versions` via `asdf set bun latest && asdf set nodejs latest`; `tsconfig.json`
   (ES2022/Node16) copied from family conventions.
3. `bin/metabase-axi.ts` → `main()`; `src/cli.ts` wires `runAxiCli({description,version,
   topLevelHelp,home,commands,getCommandHelp,resolveContext})` with all Tier-0/1 commands
   registered as stubs.
4. `src/meta.ts` (`DESCRIPTION`, `readVersion`). Placeholder `home` returning the
   onboarding view.
5. `README.md` skeleton, MIT `LICENSE`.

## Validation

- [x] `bun run build` produces `dist/` with no type errors.
- [x] `metabase-axi --help` prints `TOP_HELP`; `metabase-axi --version` prints the version.
- [x] Every Tier-0/1 command is registered and returns a structured "not implemented yet"
      notice (no crash).
- [x] `metabase-axi` (no args) runs the placeholder home without throwing.
- [x] `vitest run` passes (smoke tests for help/version/unknown-command/per-command help).

## Risks / unknowns

- **SDK version drift** — pin `axi-sdk-js` to the version verified in architecture.md.

## Notes

- Shipped directly to `main` (no PR; pre-v1, per owner direction).
- Pinned `axi-sdk-js@0.1.7`, `@toon-format/toon@2.3.0`; bun 1.3.14 / nodejs 22.22.3.
- **SDK exports only `cli`/`errors`/`hooks`** — the `output.js` helpers (`renderOutput`
  etc.) are NOT re-exported. Like the rest of the family, we build TOON via
  `@toon-format/toon`'s `encode` directly in `src/output.ts`.
- Command handlers return structured objects; the SDK TOON-encodes them at the boundary
  and merges the bin/description header for the home view. Confirmed the emitted shape
  matches the family (`thing[N]{cols}:` + `help[N]:`).
- `cli.ts` exposes a `cliOptions(overrides)` factory so tests can drive dispatch with a
  captured stdout/argv.

## Follow-ups

- None. Real command logic proceeds in `config-and-auth` and `output-foundation`.
