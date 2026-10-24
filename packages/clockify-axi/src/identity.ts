import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { get } from "./rest.js";

export interface Identity {
  userId: string;
  workspaceId: string;
  timeZone?: string;
  weekStart?: string;
  workspaces?: Array<{ id: string; name: string }>;
  updatedAt: string;
}

function identityPath(): string {
  const base = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return join(base, "clockify-axi", "identity.json");
}

function readCache(): Identity | undefined {
  try {
    const parsed = JSON.parse(readFileSync(identityPath(), "utf8")) as Partial<Identity>;
    if (typeof parsed.userId === "string" && typeof parsed.workspaceId === "string") {
      return parsed as Identity;
    }
  } catch {
    // no cache yet, or an unreadable one - both mean "fetch fresh"
  }
  return undefined;
}

function writeCache(identity: Identity): void {
  try {
    const path = identityPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(identity, null, 2)}\n`, "utf8");
  } catch {
    // A read-only cache dir is not worth failing a call over.
  }
}

/**
 * `GET /user` is the only endpoint that needs no IDs, and every other
 * endpoint requires `workspaceId` (most also `userId`). Fetch it once and
 * cache it, along with `weekStart` so date-range math (THIS_WEEK etc.)
 * matches the user's real Clockify settings instead of guessing Monday.
 */
export async function getIdentity(refresh = false): Promise<Identity> {
  if (!refresh) {
    const cached = readCache();
    if (cached) return cached;
  }

  const profile = (await get("/user")) as {
    id?: string;
    activeWorkspace?: string;
    defaultWorkspace?: string;
    settings?: { timeZone?: string; weekStart?: string };
  };

  const workspaceId = profile.activeWorkspace ?? profile.defaultWorkspace;
  if (!profile.id || !workspaceId) {
    throw new AxiError("Clockify profile response is missing userId or workspace", "profile_incomplete");
  }

  let workspaces: Array<{ id: string; name: string }> | undefined;
  try {
    const list = (await get("/workspaces")) as Array<{ id: string; name: string }>;
    if (Array.isArray(list)) workspaces = list.map((w) => ({ id: w.id, name: w.name }));
  } catch {
    // not fatal - whoami still works without the full workspace list
  }

  const identity: Identity = {
    userId: profile.id,
    workspaceId,
    timeZone: profile.settings?.timeZone,
    weekStart: profile.settings?.weekStart,
    workspaces,
    updatedAt: new Date().toISOString(),
  };
  writeCache(identity);
  return identity;
}
