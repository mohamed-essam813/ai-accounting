import { describe, it, expect } from "vitest";
import { parseNaturalLanguageBillLines } from "./parse-natural-lines";

describe("parseNaturalLanguageBillLines", () => {
  it("splits qty x desc @ price lines", () => {
    const lines = parseNaturalLanguageBillLines("10 robot cleaners @ 2000\ndelivery charges 500");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0].quantity).toBe(10);
    expect(lines[1].classification).toBe("expense");
  });
});
