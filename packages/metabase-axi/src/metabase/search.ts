import type { MetabaseClient } from "./client.js";
import { normalizeList } from "./server.js";

export interface SearchItem {
  id: number | string;
  name: string;
  model: string;
  description?: string | null;
  collection?: { id?: number | string; name?: string } | null;
}

/** Cross-entity search. `models` filters by entity kind (card, dashboard, …). */
export async function search(
  client: MetabaseClient,
  query: string,
  models?: string[],
): Promise<SearchItem[]> {
  return normalizeList<SearchItem>(
    await client.get("/api/search", { query: { q: query, models } }),
  );
}
