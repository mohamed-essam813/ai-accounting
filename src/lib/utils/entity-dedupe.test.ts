import { describe, it, expect } from "vitest";
import { dedupeEntitiesForDisplay, normalizeEntityName } from "./entity-dedupe";

describe("normalizeEntityName", () => {
  it("trims, collapses spaces, lowercases", () => {
    expect(normalizeEntityName("  Apple  Inc  ")).toBe("apple inc");
    expect(normalizeEntityName("APPLE")).toBe("apple");
  });
});

describe("dedupeEntitiesForDisplay", () => {
  it("drops duplicate ids", () => {
    const rows = [
      { id: "a", name: "X", type: "vendor" },
      { id: "a", name: "Y", type: "vendor" },
    ];
    const out = dedupeEntitiesForDisplay(rows as Record<string, unknown>[], {
      idKey: "id",
      entityLabel: "test",
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("X");
  });

  it("drops same normalized name within scope (two Apple vendors)", () => {
    const rows = [
      { id: "1", name: "Apple", type: "vendor" },
      { id: "2", name: "apple", type: "vendor" },
    ];
    const out = dedupeEntitiesForDisplay(rows as Record<string, unknown>[], {
      idKey: "id",
      nameKey: "name",
      scopeKey: "type",
      entityLabel: "test",
    });
    expect(out).toHaveLength(1);
  });

  it("keeps same name across different scopes", () => {
    const rows = [
      { id: "1", name: "Acme", type: "customer" },
      { id: "2", name: "Acme", type: "vendor" },
    ];
    const out = dedupeEntitiesForDisplay(rows as Record<string, unknown>[], {
      idKey: "id",
      nameKey: "name",
      scopeKey: "type",
      entityLabel: "test",
    });
    expect(out).toHaveLength(2);
  });
});
