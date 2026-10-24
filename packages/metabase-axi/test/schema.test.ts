import { describe, it, expect } from "vitest";
import { fieldRows } from "../src/commands/database.js";
import type { Field } from "../src/metabase/database.js";

describe("fieldRows description column", () => {
  it("omits the description column when no field is annotated", () => {
    const fields: Field[] = [
      { name: "id", base_type: "type/Integer", semantic_type: "type/PK" },
      { name: "name", base_type: "type/Text" },
    ];
    const rows = fieldRows(fields);
    expect(rows[0]).toEqual({ name: "id", type: "Integer", semantic: "PK" });
    expect("description" in rows[0]).toBe(false);
  });

  it("adds a description column (for all rows) when any field is annotated", () => {
    const fields: Field[] = [
      { name: "id", base_type: "type/Integer", description: "primary key" },
      { name: "name", base_type: "type/Text" },
    ];
    const rows = fieldRows(fields);
    expect(rows[0].description).toBe("primary key");
    expect(rows[1].description).toBe(""); // present but empty, so the table stays rectangular
  });

  it("truncates long descriptions", () => {
    const rows = fieldRows([{ name: "x", base_type: "type/Text", description: "y".repeat(300) }]);
    expect(String(rows[0].description)).toContain("truncated, 300 chars total");
  });
});
