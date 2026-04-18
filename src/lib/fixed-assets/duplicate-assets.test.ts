import { describe, expect, it } from "vitest";
import { matchDuplicateCandidate } from "./duplicate-assets-matcher";

describe("duplicate-assets", () => {
  it("matches when name cost and date window align", () => {
    expect(
      matchDuplicateCandidate(
        { name: "Laptop Dell", cost: 5000, purchaseDate: "2024-01-10" },
        { id: "1", name: "laptop dell", cost: 5000, purchase_date: "2024-01-12" },
      ),
    ).toBe(true);
  });
  it("rejects when cost differs", () => {
    expect(
      matchDuplicateCandidate(
        { name: "Laptop", cost: 5000, purchaseDate: "2024-01-10" },
        { id: "1", name: "Laptop", cost: 5001, purchase_date: "2024-01-10" },
      ),
    ).toBe(false);
  });
});
