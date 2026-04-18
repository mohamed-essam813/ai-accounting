import { describe, expect, it } from "vitest";
import { similarityRatio } from "./string-similarity";

describe("contact name similarity", () => {
  it("treats Essam & Co vs Essam & Co. as high similarity", () => {
    const r = similarityRatio("Essam & Co", "Essam & Co.");
    expect(r).toBeGreaterThanOrEqual(0.85);
  });
});
