import { describe, it, expect } from "vitest";
import { dashcardsOf, type Dashboard } from "../src/metabase/dashboard.js";

describe("dashcardsOf", () => {
  const base: Dashboard = { id: 1, name: "d" };

  it("prefers dashcards, falls back to ordered_cards, else empty", () => {
    expect(dashcardsOf({ ...base, dashcards: [{ card_id: 1 }] })).toHaveLength(1);
    expect(dashcardsOf({ ...base, ordered_cards: [{ card_id: 1 }, { card_id: 2 }] })).toHaveLength(
      2,
    );
    expect(dashcardsOf(base)).toEqual([]);
  });
});
