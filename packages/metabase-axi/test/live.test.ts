import { describe, it, expect } from "vitest";
import { MetabaseClient } from "../src/metabase/client.js";
import { currentUser, databaseCount, normalizeList } from "../src/metabase/server.js";
import { databaseMetadata, listDatabases } from "../src/metabase/database.js";
import { runDataset } from "../src/metabase/dataset.js";
import { search } from "../src/metabase/search.js";
import { listCollections } from "../src/metabase/collection.js";
import { getCard, listCards } from "../src/metabase/card.js";
import { getDashboard, listDashboards } from "../src/metabase/dashboard.js";

/**
 * Live integration tests against a real instance. Skipped unless METABASE_URL +
 * METABASE_API_KEY are present in the environment, so CI and contributors without an
 * instance stay green. Run locally with those env vars set to exercise the real API.
 */
const live = Boolean(process.env.METABASE_URL && process.env.METABASE_API_KEY);

function client(): MetabaseClient {
  return new MetabaseClient({
    baseUrl: process.env.METABASE_URL as string,
    auth: { scheme: "api_key", apiKey: process.env.METABASE_API_KEY as string },
  });
}

describe.skipIf(!live)("live metabase (api key)", () => {
  it("authenticates via /api/user/current", async () => {
    const user = await currentUser(client());
    expect(typeof user.id).toBe("number");
  });

  it("lists databases (normalized {data} or array)", async () => {
    const n = await databaseCount(client());
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it("normalizeList handles both shapes", () => {
    expect(normalizeList({ data: [1, 2, 3] })).toEqual([1, 2, 3]);
    expect(normalizeList([1, 2])).toEqual([1, 2]);
    expect(normalizeList(null)).toEqual([]);
  });

  it("runs a trivial native query via /api/dataset", async () => {
    const dbs = await listDatabases(client());
    expect(dbs.length).toBeGreaterThan(0);
    // Some databases may have an unreachable downstream connection; pass if any answers.
    let ok = false;
    for (const db of dbs.slice(0, 8)) {
      try {
        const result = await runDataset(client(), {
          database: db.id,
          type: "native",
          native: { query: "SELECT 1 AS n" },
        });
        if (result.status === "completed" && result.data?.rows?.[0]?.[0] === 1) {
          ok = true;
          break;
        }
      } catch {
        // try the next database
      }
    }
    expect(ok).toBe(true);
  }, 60_000);

  it("fetches database metadata with tables", async () => {
    const dbs = await listDatabases(client());
    const meta = await databaseMetadata(client(), dbs[0].id);
    expect(Array.isArray(meta.tables)).toBe(true);
  });

  it("searches and lists collections", async () => {
    expect(Array.isArray(await search(client(), "a"))).toBe(true);
    expect(Array.isArray(await listCollections(client()))).toBe(true);
  });

  it("lists and fetches a card", async () => {
    const cards = await listCards(client(), "all");
    expect(Array.isArray(cards)).toBe(true);
    if (cards.length) {
      const card = await getCard(client(), cards[0].id);
      expect(card.id).toBe(cards[0].id);
    }
  });

  it("lists and fetches a dashboard", async () => {
    const dashboards = await listDashboards(client());
    expect(Array.isArray(dashboards)).toBe(true);
    if (dashboards.length) {
      const dash = await getDashboard(client(), dashboards[0].id);
      expect(dash.id).toBe(dashboards[0].id);
    }
  });
});
