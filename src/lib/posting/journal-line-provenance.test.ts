import { describe, it, expect } from "vitest";
import { annotateDraftPostingLines, inferAccountSource } from "./journal-line-provenance";
import type { JournalLine } from "@/lib/accounting";

describe("inferAccountSource", () => {
  it("marks edited lines as user_override", () => {
    const line: JournalLine = { account_id: "a", debit: 1, credit: 0 };
    expect(inferAccountSource(line, true)).toBe("user_override");
  });

  it("marks tax lines", () => {
    const line: JournalLine = {
      account_id: "a",
      debit: 0,
      credit: 10,
      tax_rate_id: "tax-uuid",
    };
    expect(inferAccountSource(line, false)).toBe("tax");
  });

  it("marks COGS / inventory memos as item", () => {
    const line: JournalLine = {
      account_id: "a",
      debit: 5,
      credit: 0,
      memo: "COGS: Widget",
    };
    expect(inferAccountSource(line, false)).toBe("item");
  });

  it("defaults to system_default", () => {
    const line: JournalLine = { account_id: "a", debit: 100, credit: 0, memo: "AR" };
    expect(inferAccountSource(line, false)).toBe("system_default");
  });
});

describe("annotateDraftPostingLines", () => {
  it("adds draft reference and account_source", () => {
    const draftId = "00000000-0000-4000-8000-000000000001";
    const lines: JournalLine[] = [{ account_id: "a", debit: 1, credit: 0 }];
    const out = annotateDraftPostingLines(lines, draftId, false);
    expect(out[0].reference_type).toBe("draft");
    expect(out[0].reference_id).toBe(draftId);
    expect(out[0].account_source).toBe("system_default");
  });
});
