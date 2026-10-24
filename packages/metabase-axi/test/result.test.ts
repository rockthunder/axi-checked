import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { renderQueryResult } from "../src/result.js";
import { resolveDatabaseId } from "../src/metabase/database.js";
import { parseArgs } from "../src/flags.js";
import type { ResolvedInstance } from "../src/resolve.js";
import type { QueryResult } from "../src/metabase/dataset.js";
import type { MetabaseClient } from "../src/metabase/client.js";

const instance: ResolvedInstance = {
  name: "test",
  url: "https://metabase.example.org",
  source: "default",
};

function completed(rowCount: number): QueryResult {
  return {
    status: "completed",
    row_count: rowCount,
    running_time: 12,
    data: {
      cols: [
        { name: "id", base_type: "type/Integer" },
        { name: "name", base_type: "type/Text" },
      ],
      rows: Array.from({ length: rowCount }, (_, i) => [i, `n${i}`]),
    },
  };
}

const noExport = async (): Promise<Buffer> => Buffer.from("");

describe("renderQueryResult", () => {
  it("renders preview with instance/columns and a count label", async () => {
    const out = await renderQueryResult({
      instance,
      result: completed(2),
      parsed: parseArgs([]),
      kind: "query",
      database: 6,
      exportBytes: noExport,
    });
    expect(out.instance).toBe("test (metabase.example.org)");
    expect(out.database).toBe("6");
    expect(out.rows).toBe("2");
    expect(out.columns).toBe("id:Integer, name:Text");
    expect((out.data as unknown[]).length).toBe(2);
  });

  it("caps the preview and reports `N of M`", async () => {
    const out = await renderQueryResult({
      instance,
      result: completed(100),
      parsed: parseArgs(["--limit", "5"], { valued: ["limit"] }),
      kind: "query",
      exportBytes: noExport,
    });
    expect(out.rows).toBe("5 of 100");
    expect((out.data as unknown[]).length).toBe(5);
    expect((out.help as string[]).join(" ")).toContain("raise with --limit");
  });

  it("throws QUERY_ERROR for a failed result", async () => {
    await expect(
      renderQueryResult({
        instance,
        result: { status: "failed", error: "boom" },
        parsed: parseArgs([]),
        kind: "query",
        exportBytes: noExport,
      }),
    ).rejects.toMatchObject({ code: "QUERY_ERROR" });
  });

  it("only echoes compiled SQL when requested", async () => {
    const result = completed(1);
    result.data!.native_form = { query: "SELECT 1" };
    const withSql = await renderQueryResult({
      instance,
      result,
      parsed: parseArgs([]),
      kind: "query",
      exportBytes: noExport,
      showCompiledSql: true,
    });
    expect(withSql.sql).toBe("SELECT 1");
    const withoutSql = await renderQueryResult({
      instance,
      result,
      parsed: parseArgs([]),
      kind: "query",
      exportBytes: noExport,
    });
    expect(withoutSql.sql).toBeUndefined();
  });
});

describe("renderQueryResult export", () => {
  let dir: string;
  let saved: string | undefined;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mb-axi-res-"));
    saved = process.env.METABASE_AXI_CONFIG_DIR;
    process.env.METABASE_AXI_CONFIG_DIR = dir;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.METABASE_AXI_CONFIG_DIR;
    else process.env.METABASE_AXI_CONFIG_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes JSON from the result without calling exportBytes", async () => {
    let called = false;
    const out = await renderQueryResult({
      instance,
      result: completed(3),
      parsed: parseArgs(["--json-out"]),
      kind: "query",
      exportBytes: async () => {
        called = true;
        return Buffer.from("");
      },
    });
    expect(called).toBe(false);
    expect(out.wrote).toContain("3 rows");
    const path = String(out.wrote).split(" (")[0];
    expect(JSON.parse(readFileSync(path, "utf-8")).status).toBe("completed");
  });

  it("calls exportBytes for csv and writes the bytes", async () => {
    const out = await renderQueryResult({
      instance,
      result: completed(2),
      parsed: parseArgs(["--csv-out"]),
      kind: "query",
      exportBytes: async () => Buffer.from("id,name\n0,n0\n"),
    });
    const path = String(out.wrote).split(" (")[0];
    expect(readFileSync(path, "utf-8")).toContain("id,name");
  });
});

describe("resolveDatabaseId", () => {
  const fake = (dbs: Array<{ id: number; name: string }>) =>
    ({ get: async () => ({ data: dbs }) }) as unknown as MetabaseClient;

  it("returns a numeric ref directly without a lookup", async () => {
    expect(await resolveDatabaseId(fake([]), "6")).toBe(6);
  });
  it("resolves a name (case-insensitive)", async () => {
    expect(await resolveDatabaseId(fake([{ id: 9, name: "Analytics" }]), "analytics")).toBe(9);
  });
  it("uses the sole database when no ref is given", async () => {
    expect(await resolveDatabaseId(fake([{ id: 3, name: "only" }]))).toBe(3);
  });
  it("errors on ambiguity with multiple databases", async () => {
    await expect(
      resolveDatabaseId(
        fake([
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ]),
      ),
    ).rejects.toBeInstanceOf(AxiError);
  });
});
