# plans

`plans/` is the work-in-flight DAG that bridges `specs/` (what should be true) to merged
code (motion). One file per scope-bounded chunk; each declares its `specs:`, `depends:`,
and checkbox `## Validation` that converts it to `done` at closeout.

Full protocol (frontmatter, lifecycle, closeout commit, follow-ups taxonomy):
[`.claude/skills/specops/references/plans-protocol.md`](../.claude/skills/specops/references/plans-protocol.md).

Don't hand-maintain a DAG or status table here — it rots. Query the authoritative
frontmatter instead:

```
.claude/skills/specops/scripts/specops            # dashboard
.claude/skills/specops/scripts/specops next       # what to work on next
.claude/skills/specops/scripts/specops dag        # mermaid graph
```
