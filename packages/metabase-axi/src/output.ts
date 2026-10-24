/**
 * Output helpers. Command handlers return a `Renderable` (a structured object or a
 * string); the axi SDK serializes objects to TOON at the output boundary and prepends
 * the bin/description header for the home view.
 *
 * Implements specs/behaviors/output-rendering.md (compact schemas, truncation, relative
 * time, explicit caps) and the export half of
 * specs/behaviors/result-export-and-truncation.md (per-format --json-out/--csv-out/
 * --xlsx-out to a file, with auto-path and a jq help hint).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { AxiError } from "axi-sdk-js";
import { hasFlag, type ParsedArgs } from "./flags.js";

export type StructuredOutput = Record<string, unknown>;
export type Renderable = string | StructuredOutput;

/** Default preview row cap and cell character cap (token budget). */
export const PREVIEW_ROW_CAP = 20;
export const CELL_CHAR_CAP = 120;

/** A structured "not implemented yet" notice for stub commands. */
export function notImplemented(command: string): StructuredOutput {
  return {
    message: `\`metabase-axi ${command}\` is not implemented yet`,
    help: [
      "This command is planned — see specs/commands/ and plans/ for the spec",
      "Run `metabase-axi --help` to see available commands",
    ],
  };
}

// Result preview ───────────────────────────────────────────────────────
export interface Column {
  name: string;
  base_type?: string;
}

/** Strip the `type/` prefix from a Metabase base type: `type/Integer` → `Integer`. */
export function shortType(baseType?: string): string {
  return baseType ? baseType.replace(/^type\//, "") : "?";
}

/** Compact column line with types: `id:Integer, name:Text`. */
export function columnsLine(cols: Column[]): string {
  return cols.map((c) => `${c.name}:${shortType(c.base_type)}`).join(", ");
}

/** Truncate a long string cell with an explicit marker; pass non-strings through. */
export function truncateCell(value: unknown, cap = CELL_CHAR_CAP): unknown {
  if (typeof value === "string" && value.length > cap) {
    return `${value.slice(0, cap)}… (truncated, ${value.length} chars total)`;
  }
  return value;
}

/** Map row arrays to capped objects keyed by column name (for TOON tabular encoding). */
export function rowsToObjects(
  cols: Column[],
  rows: unknown[][],
  cap = PREVIEW_ROW_CAP,
): StructuredOutput[] {
  return rows.slice(0, cap).map((row) => {
    const obj: StructuredOutput = {};
    cols.forEach((c, i) => {
      obj[c.name] = truncateCell(row[i]);
    });
    return obj;
  });
}

/** `N` when complete, `N of M` when capped — always explicit. */
export function countLabel(shown: number, total: number): string {
  return shown < total ? `${shown} of ${total}` : String(total);
}

/** Cap a list and report the count label together. */
export function capList<T>(items: T[], limit: number): { items: T[]; label: string } {
  const capped = items.slice(0, limit);
  return { items: capped, label: countLabel(capped.length, items.length) };
}

/** Relative time like `2h ago`. Falls back to the raw value when unparseable. */
export function relativeTime(iso?: string): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const units: Array<[number, string]> = [
    [60, "s"],
    [3600, "m"],
    [86400, "h"],
    [604800, "d"],
    [2592000, "w"],
    [31536000, "mo"],
    [Infinity, "y"],
  ];
  let prev = 1;
  for (const [limit, label] of units) {
    if (secs < limit) {
      const n = Math.floor(secs / prev);
      return `${n}${label} ago`;
    }
    prev = limit;
  }
  return iso;
}

// Export to file ────────────────────────────────────────────────────────
export type ExportFormat = "json" | "csv" | "xlsx";

const OUT_FLAGS: Record<string, ExportFormat> = {
  "json-out": "json",
  "csv-out": "csv",
  "xlsx-out": "xlsx",
};

export interface ExportRequest {
  format: ExportFormat;
  /** Explicit path from `--<fmt>-out=<path>`, or undefined for an auto-generated path. */
  path?: string;
}

/** Parse the export flags; at most one `*-out` is allowed. Returns undefined when none. */
export function parseExportRequest(parsed: ParsedArgs): ExportRequest | undefined {
  const present = Object.keys(OUT_FLAGS).filter((f) => hasFlag(parsed, f));
  if (present.length === 0) return undefined;
  if (present.length > 1) {
    throw new AxiError("Use at most one export flag per invocation", "VALIDATION_ERROR", [
      `Got: ${present.map((f) => `--${f}`).join(", ")}`,
    ]);
  }
  const flag = present[0];
  const value = parsed.flags[flag];
  return { format: OUT_FLAGS[flag], path: typeof value === "string" ? value : undefined };
}

function expandPath(path: string): string {
  const expanded = path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

/**
 * Resolve the destination path: the explicit one, or an auto path in the OS temp dir.
 * Auto-generated exports are ephemeral scratch, so they go in `os.tmpdir()` (OS-pruned) —
 * never under `~/.config`, which nothing prunes.
 */
export function resolveExportPath(req: ExportRequest, kind: string): string {
  if (req.path) return expandPath(req.path);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(tmpdir(), "metabase-axi", `${stamp}-${kind}.${req.format}`);
}

function exportHelpLine(format: ExportFormat, path: string): string {
  if (format === "json") {
    return `Run \`jq '.data.rows[]' ${path}\` to process the full result`;
  }
  if (format === "csv") {
    return `Run \`head ${path}\` (or open it in a spreadsheet) to use the full result`;
  }
  return `Open ${path} in a spreadsheet to use the full result`;
}

export interface ExportOutcome {
  path: string;
  wrote: string;
  columns?: string;
  helpLine: string;
}

/**
 * Write the full export to a file and describe it. `data` is a JSON string (json) or raw
 * bytes (csv/xlsx). `meta.rows`/`meta.cols` annotate the `wrote:`/`columns:` lines.
 */
export function performExport(
  req: ExportRequest,
  kind: string,
  data: string | Buffer,
  meta: { rows?: number; cols?: Column[] } = {},
): ExportOutcome {
  const path = resolveExportPath(req, kind);
  mkdirSync(dirname(path), { recursive: true });
  // Auto-generated files land in a world-readable temp dir on some platforms and may hold
  // sensitive query results → owner-only. Explicit paths are the caller's responsibility.
  const auto = !req.path;
  writeFileSync(path, data, auto ? { mode: 0o600 } : undefined);
  const rowsPart = meta.rows !== undefined ? `${meta.rows} rows` : "written";
  const colsPart = meta.cols ? `, ${meta.cols.length} cols` : "";
  return {
    path,
    wrote: `${path} (${rowsPart}${colsPart})`,
    columns: meta.cols ? columnsLine(meta.cols) : undefined,
    helpLine: exportHelpLine(req.format, path),
  };
}
