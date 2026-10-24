import { AxiError } from "axi-sdk-js";
import type { MetabaseClient } from "./client.js";
import { normalizeList } from "./server.js";

export interface Database {
  id: number;
  name: string;
  engine?: string;
  tables?: unknown[];
}

export interface Field {
  id?: number;
  name: string;
  display_name?: string;
  base_type?: string;
  semantic_type?: string | null;
  description?: string | null;
}

export interface Table {
  id?: number;
  name: string;
  display_name?: string;
  schema?: string;
  db_id?: number;
  description?: string | null;
  fields?: Field[];
}

export interface DatabaseMetadata extends Database {
  tables?: Table[];
}

export async function listDatabases(client: MetabaseClient): Promise<Database[]> {
  return normalizeList<Database>(await client.get("/api/database"));
}

export async function databaseMetadata(
  client: MetabaseClient,
  id: number,
): Promise<DatabaseMetadata> {
  return client.get<DatabaseMetadata>(`/api/database/${id}/metadata`);
}

/**
 * Resolve a database reference (numeric id, or a name) to an id. With no reference, returns
 * the sole database's id, or errors when the choice is ambiguous.
 */
export async function resolveDatabaseId(client: MetabaseClient, ref?: string): Promise<number> {
  if (ref && /^\d+$/.test(ref)) return Number(ref);
  const dbs = await listDatabases(client);
  if (ref) {
    const match = dbs.find((d) => d.name.toLowerCase() === ref.toLowerCase());
    if (!match) {
      throw new AxiError(`No database named "${ref}"`, "NOT_FOUND", [
        `Available: ${dbs.map((d) => `${d.id}:${d.name}`).join(", ") || "(none)"}`,
      ]);
    }
    return match.id;
  }
  if (dbs.length === 1) return dbs[0].id;
  throw new AxiError("Multiple databases — specify --db <id|name>", "VALIDATION_ERROR", [
    `Available: ${dbs.map((d) => `${d.id}:${d.name}`).join(", ")}`,
  ]);
}
