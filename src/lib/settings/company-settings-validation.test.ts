import { describe, expect, it } from "vitest";

/** Mirrors server-side TRN check when VAT registered */
function isValidUaeTrnDigits(s: string): boolean {
  return /^\d{15}$/.test(s.trim());
}

describe("UAE TRN (15 digits)", () => {
  it("accepts exactly 15 digits", () => {
    expect(isValidUaeTrnDigits("100123456700003")).toBe(true);
  });

  it("rejects short or non-numeric", () => {
    expect(isValidUaeTrnDigits("123")).toBe(false);
    expect(isValidUaeTrnDigits("abcdefghijklmno")).toBe(false);
  });
});
