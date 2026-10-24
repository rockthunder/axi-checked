# Items for a human to review

Generated from `review/log.tsv` by `python -I scripts/review-status.py render-manual`. **MANUAL** = high risk or unsure: please look yourself. **NOTE** = minor, benign-but-worth-knowing.

## MANUAL - needs your review

- `packages/axi/packages/axi-sdk-js/src/hooks.ts`
  Explicit opt-in (setup hooks) but powerful and persistent: writes SessionStart hooks into ~/.claude/settings.json, ~/.codex/hooks.json (or project .claude/.codex), an OpenCode plugin, and ENABLES the global [features] hooks=true flag in ~/.codex/config.toml. Hook command is an unquoted exec path or a bare binary name resolved through PATH at every agent session start (PATH-hijack / spaces-in-path risk); command-substring match (includes(marker)) can overwrite an unrelated hook that merely mentions the tool name. No network. Decide whether your org allows 'setup hooks' at all (or remove the call from each tool's setup command).

## NOTE - minor observations

_(none)_

