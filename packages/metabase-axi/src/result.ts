import { AxiError } from "axi-sdk-js";
import { numFlag, type ParsedArgs } from "./flags.js";
import {
  columnsLine,
  countLabel,
  parseExportRequest,
  performExport,
  rowsToObjects,
  PREVIEW_ROW_CAP,
  type StructuredOutput,
} from "./output.js";
import { instanceLabel, type ResolvedInstance } from "./resolve.js";
import type { QueryResult } from "./metabase/dataset.js";

export interface RenderResultOptions {
  instance: ResolvedInstance;
  result: QueryResult;
  parsed: ParsedArgs;
  /** Filename stem for an auto-generated export (e.g. "query", "card-42"). */
  kind: string;
  /** Database id to echo; falls back to the result's database_id. */
  database?: number;
  /** Fetch full csv/xlsx bytes for export (dataset or card endpoint). */
  exportBytes: (format: "csv" | "xlsx") => Promise<Buffer>;
  /** Echo the compiled SQL (native_form). Useful for MBQL/cards; redundant for native SQL. */
  showCompiledSql?: boolean;
}

/**
 * Render a query/card execution result: capped preview to stdout, optional full export to a
 * file. Shared by `query` and `card run` so both render identically.
 * (specs/behaviors/result-export-and-truncation.md + output-rendering.md)
 */
export async function renderQueryResult(opts: RenderResultOptions): Promise<StructuredOutput> {
  const { instance, result, parsed, kind } = opts;

  if (result.status === "failed") {
    throw new AxiError(`Query failed: ${result.error ?? "unknown error"}`, "QUERY_ERROR", [
      "Check the SQL/MBQL and any parameters",
    ]);
  }

  const cols = result.data?.cols ?? [];
  const rows = result.data?.rows ?? [];
  const limit = numFlag(parsed, "limit") ?? PREVIEW_ROW_CAP;
  const total = result.row_count ?? rows.length;
  const database = opts.database ?? result.database_id;

  const out: StructuredOutput = {
    instance: instanceLabel(instance),
    ...(database !== undefined ? { database: String(database) } : {}),
    rows: countLabel(Math.min(rows.length, limit), total),
    time: `${result.running_time ?? 0}ms`,
    columns: columnsLine(cols),
  };
  if (opts.showCompiledSql && result.data?.native_form?.query) {
    out.sql = result.data.native_form.query;
  }
  out.data = rowsToObjects(cols, rows, limit);

  const help: string[] = [];
  const exportReq = parseExportRequest(parsed);
  if (exportReq) {
    const data =
      exportReq.format === "json"
        ? JSON.stringify(result, null, 2)
        : await opts.exportBytes(exportReq.format);
    const outcome = performExport(exportReq, kind, data, { rows: total, cols });
    out.wrote = outcome.wrote;
    if (outcome.columns) out.columns = outcome.columns;
    help.push(outcome.helpLine);
  }

  if (rows.length > limit) {
    help.push(
      `Showing ${limit} of ${total} rows — raise with --limit <n>${
        exportReq ? "" : " or save all with --csv-out / --json-out"
      }`,
    );
  } else if (!exportReq) {
    help.push("Save the full result with --csv-out / --json-out");
  }
  out.help = help;
  return out;
}
