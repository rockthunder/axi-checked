import type { MetabaseClient } from "./client.js";
import type { DatasetQuery, QueryResult } from "./dataset.js";
import { normalizeList } from "./server.js";

export interface CardParameter {
  name?: string;
  slug?: string;
  type?: string;
}

export interface Card {
  id: number;
  name: string;
  description?: string | null;
  collection_id?: number | null;
  collection?: { name?: string } | null;
  database_id?: number | null;
  display?: string;
  query_type?: string;
  dataset_query?: DatasetQuery;
  parameters?: CardParameter[];
  updated_at?: string;
}

export async function listCards(client: MetabaseClient, filter?: string): Promise<Card[]> {
  return normalizeList<Card>(await client.get("/api/card", { query: { f: filter } }));
}

export async function getCard(client: MetabaseClient, id: number): Promise<Card> {
  return client.get<Card>(`/api/card/${id}`);
}

/** Execute a saved card. Optional `parameters` for parameterized cards. */
export async function runCard(
  client: MetabaseClient,
  id: number,
  parameters?: unknown[],
): Promise<QueryResult> {
  return client.post<QueryResult>(`/api/card/${id}/query`, {
    body: parameters ? { parameters } : {},
  });
}

/** Execute a card and export to csv/xlsx bytes. */
export async function exportCard(
  client: MetabaseClient,
  id: number,
  format: "csv" | "xlsx",
  parameters?: unknown[],
): Promise<Buffer> {
  return client.post<Buffer>(`/api/card/${id}/query/${format}`, {
    form: parameters ? { parameters: JSON.stringify(parameters) } : {},
    raw: true,
  });
}
