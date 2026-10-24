import { AxiError } from "../errors.js";
import type { AdoContext } from "../context.js";
import { requireRepo } from "../context.js";
import { azRepos, type Json } from "../az.js";
import { parseLimit, takeFlag } from "../args.js";

export const REF_HELP = `usage: ado-axi ref <subcommand> [args] [flags]
subcommands[3]:
  list, create, delete
flags{list}:
  --filter heads|tags, --top <n>
flags{create}:
  --name <branch>, --from <ref>
flags{delete}:
  --name <branch|tag>
examples:
  ado-axi ref list
  ado-axi ref list --filter heads
  ado-axi ref create --name feature/x --from main
  ado-axi ref delete --name feature/x
`;

/** az repos ref expects names like heads/my_branch or tags/my_tag (no refs/ prefix). */
function azRefName(name: string, kind: "heads" | "tags" | "auto" = "auto"): string {
  const trimmed = name.replace(/^refs\//, "");
  if (trimmed.startsWith("heads/") || trimmed.startsWith("tags/")) return trimmed;
  if (kind === "tags") return `tags/${trimmed}`;
  return `heads/${trimmed}`;
}

function shortName(ref?: string): string | null {
  if (!ref) return null;
  return ref.replace(/^refs\/(heads|tags)\//, "").replace(/^(heads|tags)\//, "");
}

export async function refCommand(
  args: string[],
  ctx?: AdoContext,
): Promise<Record<string, unknown>> {
  const sub = args[0];
  if (!sub) {
    throw new AxiError("Missing ref subcommand", "VALIDATION_ERROR", [
      "Run `ado-axi ref list`",
      "Run `ado-axi ref --help`",
    ]);
  }
  const rest = args.slice(1);
  const target = requireRepo(ctx);

  switch (sub) {
    case "list": {
      const filter = takeFlag(rest, "--filter") ?? "heads";
      if (filter !== "heads" && filter !== "tags") {
        throw new AxiError(
          `Invalid --filter: ${filter}`,
          "VALIDATION_ERROR",
          ["Valid: heads, tags"],
        );
      }
      const top = parseLimit(takeFlag(rest, "--top"), 50);
      const result = await azRepos(
        [
          "ref",
          "list",
          "--repository",
          target.repo,
          "--filter",
          filter,
        ],
        target,
      );
      const refs = (Array.isArray(result) ? result : []).slice(0, top);
      return {
        count: refs.length,
        refs: refs.map((r: Json) => ({
          name: shortName(r.name),
          object_id: r.objectId?.slice(0, 12) ?? null,
          creator: r.creator?.uniqueName ?? r.creator?.displayName ?? null,
        })),
        help:
          refs.length === 0
            ? [`0 ${filter} found`]
            : [
                "Run `ado-axi ref create --name <branch> --from <ref>`",
                "Run `ado-axi pr create --title \"...\" --source-branch <name>`",
              ],
      };
    }
    case "create": {
      const name = takeFlag(rest, "--name");
      const from = takeFlag(rest, "--from") ?? "main";
      if (!name) {
        throw new AxiError("--name is required", "VALIDATION_ERROR", [
          "ado-axi ref create --name feature/x --from main",
        ]);
      }
      const refName = azRefName(name, "heads");
      try {
        const created = await azRepos(
          [
            "ref",
            "create",
            "--repository",
            target.repo,
            "--name",
            refName,
            "--object-id",
            await resolveObjectId(target, from),
          ],
          target,
        );
        const row = Array.isArray(created) ? created[0] : created;
        if (row?.success === false) {
          // Idempotent: already exists
          if (/already exists/i.test(String(row?.customMessage ?? row?.updateStatus ?? ""))) {
            return {
              ref: { name: shortName(refName), already: true },
              help: [`Branch ${shortName(refName)} already exists (no-op)`],
            };
          }
          throw new AxiError(
            String(row?.customMessage ?? "Failed to create ref"),
            "UNKNOWN",
          );
        }
        return {
          ref: {
            name: shortName(refName),
            object_id: row?.newObjectId?.slice(0, 12) ?? null,
          },
          help: [
            `Run \`ado-axi pr create --title "..." --source-branch ${shortName(refName)}\``,
          ],
        };
      } catch (error) {
        if (
          error instanceof AxiError &&
          /already exists/i.test(error.message)
        ) {
          return {
            ref: { name: shortName(refName), already: true },
            help: [`Branch ${shortName(refName)} already exists (no-op)`],
          };
        }
        throw error;
      }
    }
    case "delete": {
      const name = takeFlag(rest, "--name");
      if (!name) {
        throw new AxiError("--name is required", "VALIDATION_ERROR", [
          "ado-axi ref delete --name feature/x",
        ]);
      }
      const refName = azRefName(name);
      const listed = await azRepos(
        [
          "ref",
          "list",
          "--repository",
          target.repo,
          "--filter",
          refName,
        ],
        target,
      );
      const fullName = `refs/${refName}`;
      const match = (Array.isArray(listed) ? listed : []).find(
        (r: Json) => r.name === fullName || r.name === refName,
      );
      if (!match) {
        return {
          ref: { name: shortName(refName), already_absent: true },
          help: [`Ref ${shortName(refName)} already absent (no-op)`],
        };
      }
      await azRepos(
        [
          "ref",
          "delete",
          "--repository",
          target.repo,
          "--name",
          refName,
          "--object-id",
          match.objectId,
        ],
        target,
      );
      return {
        ref: { name: shortName(refName), deleted: true },
        help: ["Run `ado-axi ref list`"],
      };
    }
    default:
      throw new AxiError(`Unknown ref subcommand: ${sub}`, "VALIDATION_ERROR", [
        "Valid: list, create, delete",
      ]);
  }
}

async function resolveObjectId(ctx: AdoContext, from: string): Promise<string> {
  if (/^[0-9a-f]{40}$/i.test(from)) return from;
  const filter = from.startsWith("refs/")
    ? from.replace(/^refs\//, "")
    : `heads/${from.replace(/^heads\//, "")}`;
  const listed = await azRepos(
    ["ref", "list", "--repository", ctx.repo!, "--filter", filter],
    ctx,
  );
  const refs = Array.isArray(listed) ? listed : [];
  const want = azRefName(from);
  const exact = refs.find(
    (r: Json) =>
      r.name === `refs/${want}` ||
      r.name === want ||
      shortName(r.name) === shortName(want),
  );
  if (!exact?.objectId) {
    throw new AxiError(
      `Could not resolve --from ref: ${from}`,
      "NOT_FOUND",
      ["Pass an existing branch name (e.g. main) or a 40-char object id"],
    );
  }
  return exact.objectId;
}
