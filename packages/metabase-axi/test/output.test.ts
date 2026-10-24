import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import {
  capList,
  columnsLine,
  countLabel,
  parseExportRequest,
  performExport,
  relativeTime,
  rowsToObjects,
  shortType,
  truncateCell,
  PREVIEW_ROW_CAP,
} from "../src/output.js";
import { parseArgs } from "../src/flags.js";

describe("preview helpers", () => {
  it("shortType strips the type/ prefix", () => {
    expect(shortType("type/Integer")).toBe("Integer");
    expect(shortType(undefined)).toBe("?");
  });

  it("columnsLine renders name:type pairs", () => {
    expect(
      columnsLine([
        { name: "id", base_type: "type/Integer" },
        { name: "n", base_type: "type/Text" },
      ]),
    ).toBe("id:Integer, n:Text");
  });

  it("truncateCell marks long strings and passes others through", () => {
    expect(truncateCell("x".repeat(200))).toContain("truncated, 200 chars total");
    expect(truncateCell(42)).toBe(42);
  });

  it("rowsToObjects caps rows and keys by column name", () => {
    const cols = [{ name: "a" }, { name: "b" }];
    const rows = Array.from({ length: 50 }, (_, i) => [i, `v${i}`]);
    const out = rowsToObjects(cols, rows, PREVIEW_ROW_CAP);
    expect(out).toHaveLength(PREVIEW_ROW_CAP);
    expect(out[0]).toEqual({ a: 0, b: "v0" });
  });

  it("countLabel and capList report explicit counts", () => {
    expect(countLabel(20, 100)).toBe("20 of 100");
    expect(countLabel(5, 5)).toBe("5");
    const { items, label } = capList([1, 2, 3, 4], 2);
    expect(items).toEqual([1, 2]);
    expect(label).toBe("2 of 4");
  });

  it("relativeTime renders an hours-ago bucket", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    expect(relativeTime(twoHoursAgo)).toBe("2h ago");
    expect(relativeTime(undefined)).toBe("");
  });
});

describe("export flags + writing", () => {
  let dir: string;
  let savedConfigDir: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mb-axi-out-"));
    savedConfigDir = process.env.METABASE_AXI_CONFIG_DIR;
    process.env.METABASE_AXI_CONFIG_DIR = dir;
  });
  afterEach(() => {
    if (savedConfigDir === undefined) delete process.env.METABASE_AXI_CONFIG_DIR;
    else process.env.METABASE_AXI_CONFIG_DIR = savedConfigDir;
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined when no export flag is present", () => {
    expect(parseExportRequest(parseArgs(["foo"]))).toBeUndefined();
  });

  it("parses a single export flag with and without a path", () => {
    expect(parseExportRequest(parseArgs(["--json-out"]))).toEqual({
      format: "json",
      path: undefined,
    });
    expect(parseExportRequest(parseArgs(["--csv-out=/tmp/x.csv"]))).toEqual({
      format: "csv",
      path: "/tmp/x.csv",
    });
  });

  it("rejects more than one export flag", () => {
    expect(() => parseExportRequest(parseArgs(["--json-out", "--csv-out"]))).toThrow(AxiError);
  });

  it("writes json to an explicit path with wrote/columns/help", () => {
    const target = join(dir, "out.json");
    const outcome = performExport(
      { format: "json", path: target },
      "query",
      JSON.stringify({ data: { rows: [[1]] } }),
      { rows: 1, cols: [{ name: "n", base_type: "type/Integer" }] },
    );
    expect(outcome.path).toBe(target);
    expect(existsSync(target)).toBe(true);
    expect(outcome.wrote).toContain("1 rows, 1 cols");
    expect(outcome.columns).toBe("n:Integer");
    expect(outcome.helpLine).toContain("jq '.data.rows[]'");
  });

  it("auto-generates an owner-only (0600) path in the OS temp dir, not under config", () => {
    const outcome = performExport({ format: "csv" }, "card", Buffer.from("a,b\n1,2\n"));
    expect(outcome.path.startsWith(join(tmpdir(), "metabase-axi"))).toBe(true);
    expect(outcome.path.startsWith(dir)).toBe(false); // never under the config dir
    expect(outcome.path.endsWith(".csv")).toBe(true);
    expect(readFileSync(outcome.path, "utf-8")).toContain("a,b");
    expect(statSync(outcome.path).mode & 0o777).toBe(0o600);
    expect(outcome.helpLine).toContain("head");
    rmSync(outcome.path, { force: true });
  });
});
