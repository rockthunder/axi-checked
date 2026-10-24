import { usageError } from "../usage.js";
import { many, one, parseFlags } from "../flags.js";
import { reportsPost } from "../rest.js";
import { getIdentity } from "../identity.js";
import { assertOneOf, computeDateRange, DATE_RANGES, GROUPINGS } from "../reports.js";

export const REPORT_HELP = `clockify-axi report <summary|detail> --range <range> [flags]

Fetch aggregated (summary) or per-entry (detail) time tracking data for the
whole workspace.

  report summary --range <range> [--group <grouping>]
    --group <name>    ${GROUPINGS.join(" | ")} (default: PROJECT)

  report detail --range <range> [--project <id>...] [--client <id>...] [--tag <id>...] [--search <text>]

Flags (both):
  --range <range>       ${DATE_RANGES.join(" | ")}
  --from <iso-date>     Start date, required if --range CUSTOM
  --to <iso-date>       End date, required if --range CUSTOM

Examples:
  clockify-axi report summary --range THIS_WEEK
  clockify-axi report summary --range LAST_MONTH --group CLIENT
  clockify-axi report detail --range THIS_WEEK --project 671...e56`;

interface SummaryGroup {
  _id: string;
  name: string;
  duration: number;
  amount?: number;
  clientName?: string;
}

interface SummaryResponse {
  totals?: Array<{ totalTime: number; totalBillableTime: number; entriesCount: number }>;
  groupOne?: SummaryGroup[];
}

interface DetailEntry {
  _id: string;
  description: string;
  projectId?: string;
  taskId?: string;
  tagIds?: string[] | null;
  billable: boolean;
  timeInterval: { start: string; end?: string; duration?: number };
}

interface DetailResponse {
  totals?: Array<{ totalTime: number; entriesCount: number }>;
  timeentries?: DetailEntry[];
}

async function dateRange(flags: ReturnType<typeof parseFlags>, weekStart: string | undefined): Promise<{ start: string; end: string }> {
  const range = one(flags, "range");
  if (!range) throw usageError("report requires --range", [`Valid values: ${DATE_RANGES.join(", ")}`]);
  assertOneOf(range, DATE_RANGES, "--range");
  return computeDateRange(range, weekStart, one(flags, "from"), one(flags, "to"));
}

async function summaryCommand(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseFlags(args, { value: ["range", "from", "to", "group"] });
  const group = one(flags, "group") ?? "PROJECT";
  assertOneOf(group, GROUPINGS, "--group");
  const identity = await getIdentity();
  const { start, end } = await dateRange(flags, identity.weekStart);

  const result = (await reportsPost(`/workspaces/${identity.workspaceId}/reports/summary`, {
    dateRangeStart: start,
    dateRangeEnd: end,
    summaryFilter: { groups: [group] },
  })) as SummaryResponse;

  const totals = result.totals?.[0];
  return {
    report: "summary",
    group,
    totalSeconds: totals?.totalTime ?? 0,
    totalBillableSeconds: totals?.totalBillableTime ?? 0,
    entriesCount: totals?.entriesCount ?? 0,
    count: result.groupOne?.length ?? 0,
    groups: (result.groupOne ?? []).map((g) => ({
      id: g._id,
      name: g.name,
      durationSeconds: g.duration,
      amount: g.amount ?? 0,
      clientName: g.clientName ?? "",
    })),
  };
}

async function detailCommand(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseFlags(args, { value: ["range", "from", "to", "project", "client", "tag", "search"] });
  const identity = await getIdentity();
  const { start, end } = await dateRange(flags, identity.weekStart);
  const projects = many(flags, "project");
  const clients = many(flags, "client");
  const tags = many(flags, "tag");
  const search = one(flags, "search");

  const result = (await reportsPost(`/workspaces/${identity.workspaceId}/reports/detailed`, {
    dateRangeStart: start,
    dateRangeEnd: end,
    detailedFilter: { page: 1, pageSize: 200 },
    ...(projects ? { projects: { ids: projects } } : {}),
    ...(clients ? { clients: { ids: clients } } : {}),
    ...(tags ? { tags: { ids: tags } } : {}),
    ...(search ? { description: search } : {}),
  })) as DetailResponse;

  const entries = result.timeentries ?? [];
  return {
    report: "detail",
    entriesCount: result.totals?.[0]?.entriesCount ?? entries.length,
    count: entries.length,
    entries: entries.map((e) => ({
      id: e._id,
      description: e.description,
      projectId: e.projectId ?? "",
      taskId: e.taskId ?? "",
      tagIds: (e.tagIds ?? []).join(","),
      billable: e.billable,
      start: e.timeInterval.start,
      end: e.timeInterval.end ?? "",
      durationSeconds: e.timeInterval.duration ?? 0,
    })),
  };
}

export async function reportCommand(args: string[]): Promise<Record<string, unknown>> {
  const [kind, ...rest] = args;
  if (kind === "summary") return summaryCommand(rest);
  if (kind === "detail") return detailCommand(rest);
  throw usageError(`Unknown report target "${kind ?? ""}"`, ["Valid targets: summary, detail", "Run `clockify-axi report --help`"]);
}
