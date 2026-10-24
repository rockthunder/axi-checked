import { AxiError } from "axi-sdk-js";
import { createClient, instanceLabel } from "../resolve.js";
import { search, type SearchItem } from "../metabase/search.js";
import { capList, type StructuredOutput } from "../output.js";
import { numFlag, parseArgs, strFlag } from "../flags.js";

export const SEARCH_HELP = `usage: metabase-axi search <query> [flags]
flags:
  --type <models>     comma-separated: card,dashboard,collection,table,dataset
  --limit <n>
  --instance <name>
examples:
  metabase-axi search "revenue"
  metabase-axi search "orders" --type table,card`;

function collectionName(item: SearchItem): string {
  return item.collection?.name ?? "";
}

export async function searchCommand(args: string[]): Promise<StructuredOutput> {
  const parsed = parseArgs(args, { valued: ["instance", "limit", "type"] });
  const query = parsed.positionals[0];
  if (!query) {
    throw new AxiError("A search query is required", "VALIDATION_ERROR", [
      'metabase-axi search "<query>"',
    ]);
  }
  const { instance, client } = createClient({
    instanceFlag: strFlag(parsed, "instance"),
    risky: false,
  });
  const typeStr = strFlag(parsed, "type");
  const models = typeStr
    ? typeStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const items = await search(client, query, models);
  if (items.length === 0) {
    return {
      instance: instanceLabel(instance),
      message: `0 results for "${query}"`,
      help: ["Broaden the query, or drop/adjust --type"],
    };
  }

  const { items: capped, label } = capList(items, numFlag(parsed, "limit") ?? 30);
  const out: StructuredOutput = {
    instance: instanceLabel(instance),
    results: capped.map((it) => ({
      model: it.model,
      id: it.id,
      name: it.name,
      collection: collectionName(it),
    })),
  };
  if (items.length > capped.length) out.count = label;
  out.help = [
    "Open a card: `metabase-axi card view <id>` or `card run <id>`",
    "Open a dashboard: `metabase-axi dashboard view <id>`",
  ];
  return out;
}
