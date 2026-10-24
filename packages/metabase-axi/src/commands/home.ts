import { createClient, instanceLabel } from "../resolve.js";
import { getProfile, listProfileNames, readConfig } from "../config.js";
import { normalizeList, type CurrentUser } from "../metabase/server.js";
import type { Card } from "../metabase/card.js";
import { relativeTime, type StructuredOutput } from "../output.js";

const HOME_TIMEOUT_MS = 5000;

const COMMON_HELP = [
  "Run `metabase-axi db list` (then `db schema <id>` for tables/fields)",
  'Run `metabase-axi search "<query>"` to find cards, dashboards, tables',
  'Run `metabase-axi query "SELECT …" --db <id>` to run SQL',
  "Run `metabase-axi --help` for the full command list",
  "Run `metabase-axi <command> --help` for usage on any command",
];

function onboarding(): StructuredOutput {
  return {
    status: "not configured",
    help: [
      "Run `metabase-axi auth add <name> --url <url> --api-key <key>` to add an instance",
      "Or set METABASE_URL + METABASE_API_KEY for a one-off",
      "Run `metabase-axi doctor` to verify connectivity",
      "Run `metabase-axi --help` for the full command list",
      "Run `metabase-axi <command> --help` for usage on any command",
    ],
  };
}

/**
 * Content-first home view, also injected by the SessionStart hook. Resilient: never throws,
 * uses the cached profile summary when present, and degrades on an unreachable instance.
 */
export async function homeCommand(): Promise<StructuredOutput> {
  let resolved;
  try {
    resolved = createClient({ risky: false });
  } catch {
    return onboarding();
  }
  const { instance, client } = resolved;
  const cfg = readConfig();
  const out: StructuredOutput = { instance: instanceLabel(instance) };

  // Status: prefer the cached profile summary to keep the hook fast.
  const cache = instance.profileName ? getProfile(cfg, instance.profileName)?.cache : undefined;
  if (cache?.user_name) {
    const parts = [`user ${cache.user_name}`];
    if (cache.version) parts.push(cache.version);
    if (cache.database_count !== undefined) parts.push(`${cache.database_count} databases`);
    out.status = parts.join(", ");
  } else {
    try {
      const user = await client.get<CurrentUser>("/api/user/current", {
        timeoutMs: HOME_TIMEOUT_MS,
      });
      out.status = `user ${user.common_name ?? user.email}`;
    } catch {
      out.status = "configured but not reachable";
      out.help = [
        "Run `metabase-axi doctor` to diagnose",
        "Run `metabase-axi --help` for the full command list",
        "Run `metabase-axi <command> --help` for usage on any command",
      ];
      return out;
    }
  }

  const names = listProfileNames(cfg);
  if (names.length > 1) {
    out.profiles = `${names.length} configured (default: ${cfg.default}) — use --instance to switch`;
  }

  // Recent content: best-effort, never fatal.
  try {
    const cards = normalizeList<Card>(
      await client.get("/api/card", { query: { f: "all" }, timeoutMs: HOME_TIMEOUT_MS }),
    );
    const recent = [...cards]
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
      .slice(0, 5);
    if (recent.length) {
      out.recent_cards = recent.map((c) => ({
        id: c.id,
        name: c.name,
        edited: relativeTime(c.updated_at),
      }));
    }
  } catch {
    // skip recent content if the call fails
  }

  out.help = COMMON_HELP;
  return out;
}
