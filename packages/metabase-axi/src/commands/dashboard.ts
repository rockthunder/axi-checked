import { AxiError } from "axi-sdk-js";
import { createClient, instanceLabel } from "../resolve.js";
import { dashcardsOf, getDashboard, listDashboards } from "../metabase/dashboard.js";
import {
  capList,
  parseExportRequest,
  performExport,
  relativeTime,
  type StructuredOutput,
} from "../output.js";
import { numFlag, parseArgs, strFlag } from "../flags.js";

export const DASHBOARD_HELP = `usage: metabase-axi dashboard <subcommand> [flags]
subcommands[2]:
  list              list dashboards
  view <id>         show dashcards, parameters, and tabs
flags{list}:
  --collection <id>, --archived, --limit <n>, --instance <name>
flags{view}:
  --json-out[=path], --instance <name>
examples:
  metabase-axi dashboard list
  metabase-axi dashboard view 7`;

export async function dashboardCommand(args: string[]): Promise<StructuredOutput> {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case undefined:
    case "list":
      return dashboardList(rest);
    case "view":
      return dashboardView(rest);
    default:
      throw new AxiError(`Unknown dashboard subcommand: ${sub}`, "VALIDATION_ERROR", [
        "Run `metabase-axi dashboard --help` for usage",
      ]);
  }
}

async function dashboardList(rest: string[]): Promise<StructuredOutput> {
  const parsed = parseArgs(rest, { valued: ["instance", "collection", "limit"] });
  const { instance, client } = createClient({
    instanceFlag: strFlag(parsed, "instance"),
    risky: false,
  });
  let dashboards = await listDashboards(client);
  const collFilter = strFlag(parsed, "collection");
  if (collFilter) {
    dashboards = dashboards.filter((d) => String(d.collection_id ?? "") === collFilter);
  }
  const { items, label } = capList(dashboards, numFlag(parsed, "limit") ?? 30);
  const out: StructuredOutput = {
    instance: instanceLabel(instance),
    dashboards: items.map((d) => ({
      id: d.id,
      name: d.name,
      collection: d.collection?.name ?? "",
      edited: relativeTime(d.updated_at),
    })),
  };
  if (dashboards.length > items.length) out.count = label;
  out.help = ["Run `metabase-axi dashboard view <id>` to see its cards and filters"];
  return out;
}

async function dashboardView(rest: string[]): Promise<StructuredOutput> {
  const parsed = parseArgs(rest, { valued: ["instance"] });
  const id = parsed.positionals[0];
  if (!id) {
    throw new AxiError("A dashboard id is required", "VALIDATION_ERROR", [
      "metabase-axi dashboard view <id>",
    ]);
  }
  const { instance, client } = createClient({
    instanceFlag: strFlag(parsed, "instance"),
    risky: false,
  });
  const dash = await getDashboard(client, Number(id));
  const tabs = dash.tabs ?? [];
  const tabName = (tid?: number | null) => tabs.find((t) => t.id === tid)?.name ?? "";

  const out: StructuredOutput = {
    instance: instanceLabel(instance),
    dashboard: `${dash.id}: ${dash.name}`,
    collection: dash.collection?.name ?? "",
  };
  if (tabs.length) out.tabs = tabs.map((t) => t.name);

  const exportReq = parseExportRequest(parsed);
  if (exportReq) {
    if (exportReq.format !== "json") {
      throw new AxiError("Dashboard export is JSON only — use --json-out", "VALIDATION_ERROR", []);
    }
    const outcome = performExport(exportReq, `dashboard-${id}`, JSON.stringify(dash, null, 2));
    out.wrote = outcome.wrote;
  }

  out.cards = dashcardsOf(dash)
    .filter((dc) => dc.card_id)
    .map((dc) => ({
      card_id: dc.card_id,
      name: dc.card?.name ?? "",
      viz: dc.card?.display ?? "",
      ...(tabs.length ? { tab: tabName(dc.dashboard_tab_id) } : {}),
    }));

  const params = dash.parameters ?? [];
  if (params.length) {
    out.parameters = params.map((p) => ({ name: p.name ?? p.slug ?? "", type: p.type ?? "" }));
  }

  out.help = ["Run `metabase-axi card run <card_id>` to execute one of these cards"];
  return out;
}
