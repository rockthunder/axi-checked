import { AxiError } from "axi-sdk-js";
import { createClient } from "../resolve.js";
import { exportDataset, runDataset, type DatasetQuery } from "../metabase/dataset.js";
import { resolveDatabaseId } from "../metabase/database.js";
import { renderQueryResult } from "../result.js";
import { numFlag, parseArgs, strFlag } from "../flags.js";
import type { StructuredOutput } from "../output.js";

export const QUERY_HELP = `usage: metabase-axi query <sql> [flags]
       metabase-axi query -            read native SQL from stdin
       metabase-axi query --mbql <json>
flags:
  --instance <name>   target profile (required when ambiguous)
  --db <id|name>      database to run against (required for native SQL unless single-db)
  --mbql <json>       run a structured MBQL query instead of native SQL
  --params <json>     parameter / template-tag values (JSON array)
  --limit <n>         preview row cap (default 20)
  --json-out[=path]   write full result as JSON (auto-path if omitted)
  --csv-out[=path]    write full result as CSV
  --xlsx-out[=path]   write full result as XLSX
examples:
  metabase-axi query "SELECT 1 AS n" --db 6
  metabase-axi query "SELECT * FROM orders" --db 6 --csv-out /tmp/orders.csv`;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8").trim();
}

export async function queryCommand(args: string[]): Promise<StructuredOutput> {
  const parsed = parseArgs(args, {
    valued: ["instance", "db", "mbql", "params", "limit"],
  });
  // Ad-hoc queries are potentially expensive → risky resolution (no silent default).
  const { instance, client } = createClient({
    instanceFlag: strFlag(parsed, "instance"),
    risky: true,
  });

  let query: DatasetQuery;
  let isMbql = false;
  const mbqlStr = strFlag(parsed, "mbql");
  if (mbqlStr) {
    let mbql: Record<string, unknown>;
    try {
      mbql = JSON.parse(mbqlStr) as Record<string, unknown>;
    } catch {
      throw new AxiError("--mbql is not valid JSON", "VALIDATION_ERROR", [
        'Example: --mbql \'{"source-table":42,"limit":10}\'',
      ]);
    }
    const database =
      numFlag(parsed, "db") ??
      (typeof mbql.database === "number" ? (mbql.database as number) : undefined);
    if (database === undefined) {
      throw new AxiError("--db is required for an MBQL query", "VALIDATION_ERROR", [
        "Pass --db <id|name>, or include a database in the MBQL JSON",
      ]);
    }
    const inner = (mbql.query as Record<string, unknown>) ?? mbql;
    query = { database, type: "query", query: inner };
    isMbql = true;
  } else {
    let sql = parsed.positionals[0];
    if (sql === "-") sql = await readStdin();
    if (!sql) {
      throw new AxiError("Provide a SQL string, `-` for stdin, or --mbql", "VALIDATION_ERROR", [
        'metabase-axi query "SELECT 1" --db <id|name>',
      ]);
    }
    const database = await resolveDatabaseId(client, strFlag(parsed, "db"));
    query = { database, type: "native", native: { query: sql } };
    const paramsStr = strFlag(parsed, "params");
    if (paramsStr) {
      try {
        query.parameters = JSON.parse(paramsStr) as unknown[];
      } catch {
        throw new AxiError("--params is not valid JSON", "VALIDATION_ERROR", [
          'Example: --params \'[{"type":"category","value":"x","target":[...]}]\'',
        ]);
      }
    }
  }

  const result = await runDataset(client, query);
  return renderQueryResult({
    instance,
    result,
    parsed,
    kind: "query",
    database: query.database,
    showCompiledSql: isMbql,
    exportBytes: (format) => exportDataset(client, query, format),
  });
}
