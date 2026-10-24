import { AxiError } from "axi-sdk-js";
import { createClient, instanceLabel } from "../resolve.js";
import { immediateParent, listCollections } from "../metabase/collection.js";
import { capList, type StructuredOutput } from "../output.js";
import { hasFlag, numFlag, parseArgs, strFlag } from "../flags.js";

export const COLLECTION_HELP = `usage: metabase-axi collection list [flags]
flags:
  --parent <id>     direct children of one collection
  --namespace <ns>
  --archived
  --limit <n>
  --instance <name>
examples:
  metabase-axi collection list
  metabase-axi collection list --parent 12`;

export async function collectionCommand(args: string[]): Promise<StructuredOutput> {
  const sub = args[0];
  let rest: string[];
  if (sub === "list") rest = args.slice(1);
  else if (!sub || sub.startsWith("-")) rest = args;
  else {
    throw new AxiError(`Unknown collection subcommand: ${sub}`, "VALIDATION_ERROR", [
      "Run `metabase-axi collection --help` for usage",
    ]);
  }

  const parsed = parseArgs(rest, {
    valued: ["instance", "parent", "namespace", "limit"],
  });
  const { instance, client } = createClient({
    instanceFlag: strFlag(parsed, "instance"),
    risky: false,
  });

  let cols = await listCollections(client, strFlag(parsed, "namespace"));
  const wantArchived = hasFlag(parsed, "archived");
  cols = cols.filter((c) => (wantArchived ? c.archived : !c.archived));

  const parent = strFlag(parsed, "parent");
  if (parent) {
    cols = cols.filter((c) => immediateParent(c.location) === parent);
  }

  const { items, label } = capList(cols, numFlag(parsed, "limit") ?? 100);
  const out: StructuredOutput = {
    instance: instanceLabel(instance),
  };
  if (parent) out.parent = parent;
  out.collections = items.map((c) => ({
    id: c.id,
    name: c.name,
    parent: immediateParent(c.location) ?? "root",
    personal: c.personal_owner_id ? "yes" : "",
  }));
  if (cols.length > items.length) out.count = label;
  out.help = [
    "Run `metabase-axi collection list --parent <id>` to descend",
    "Run `metabase-axi card list --collection <id>` to see its cards",
  ];
  return out;
}
