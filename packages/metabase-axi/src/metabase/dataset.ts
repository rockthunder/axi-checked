import type { MetabaseClient } from "./client.js";

export interface DatasetQuery {
  database: number;
  type: "native" | "query";
  native?: { query: string; "template-tags"?: Record<string, unknown> };
  query?: Record<string, unknown>;
  parameters?: unknown[];
}

export interface ResultColumn {
  name: string;
  base_type?: string;
}

export interface QueryResult {
  status: string; // "completed" | "failed"
  database_id?: number;
  row_count?: number;
  running_time?: number;
  data?: {
    rows: unknown[][];
    cols: ResultColumn[];
    native_form?: { query?: string };
  };
  error?: string;
}

export type ExportableFormat = "csv" | "xlsx" | "json";

/** Execute an ad-hoc dataset query (native SQL or MBQL). Mutates nothing server-side. */
export async function runDataset(
  client: MetabaseClient,
  query: DatasetQuery,
): Promise<QueryResult> {
  return client.post<QueryResult>("/api/dataset", { body: query });
}

/** Execute and export a dataset query as raw bytes (csv/xlsx). */
export async function exportDataset(
  client: MetabaseClient,
  query: DatasetQuery,
  format: "csv" | "xlsx",
): Promise<Buffer> {
  return client.post<Buffer>(`/api/dataset/${format}`, {
    form: { query: JSON.stringify(query) },
    raw: true,
  });
}
