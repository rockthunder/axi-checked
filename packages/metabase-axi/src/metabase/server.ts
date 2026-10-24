import type { ProfileCache } from "../config.js";
import type { MetabaseClient } from "./client.js";

export interface CurrentUser {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  common_name?: string;
  is_superuser?: boolean;
}

/** Normalize a Metabase list response: some endpoints return `{data:[…]}`, others a bare array. */
export function normalizeList<T = unknown>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === "object" && Array.isArray((res as { data?: unknown }).data)) {
    return (res as { data: T[] }).data;
  }
  return [];
}

export async function currentUser(client: MetabaseClient): Promise<CurrentUser> {
  return client.get<CurrentUser>("/api/user/current");
}

export async function databaseCount(client: MetabaseClient): Promise<number> {
  return normalizeList(await client.get("/api/database")).length;
}

/** Best-effort server version tag; undefined if unavailable. */
export async function serverVersion(client: MetabaseClient): Promise<string | undefined> {
  try {
    const props = await client.get<{ version?: { tag?: string } }>("/api/session/properties");
    return props?.version?.tag;
  } catch {
    return undefined;
  }
}

/** Validate auth and gather a profile cache summary (best-effort on version/count). */
export async function profileSummary(client: MetabaseClient): Promise<ProfileCache> {
  const user = await currentUser(client); // throws on bad auth / unreachable
  let database_count: number | undefined;
  try {
    database_count = await databaseCount(client);
  } catch {
    database_count = undefined;
  }
  return {
    user_name: user.common_name ?? user.email,
    version: await serverVersion(client),
    database_count,
    cached_at: new Date().toISOString(),
  };
}
