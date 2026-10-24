import type { MetabaseClient } from "./client.js";
import { normalizeList } from "./server.js";

export interface Collection {
  id: number | string;
  name: string;
  location?: string;
  personal_owner_id?: number | null;
  archived?: boolean;
}

export async function listCollections(
  client: MetabaseClient,
  namespace?: string,
): Promise<Collection[]> {
  return normalizeList<Collection>(await client.get("/api/collection", { query: { namespace } }));
}

/** The immediate parent id from a collection `location` path ("/1/2/" → "2"); undefined at top level. */
export function immediateParent(location?: string): string | undefined {
  const parts = (location ?? "/").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}
