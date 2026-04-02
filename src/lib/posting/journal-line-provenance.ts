import type { JournalAccountSource, JournalLine } from "@/lib/accounting";

/**
 * Tag journal lines when posting a draft: account_source + reference to the draft document.
 */
export function annotateDraftPostingLines(
  lines: JournalLine[],
  draftId: string,
  usedEditedLines: boolean,
): JournalLine[] {
  return lines.map((line) => {
    const account_source = inferAccountSource(line, usedEditedLines);
    return {
      ...line,
      account_source,
      reference_type: "draft",
      reference_id: draftId,
    };
  });
}

export function inferAccountSource(
  line: JournalLine,
  usedEditedLines: boolean,
): JournalAccountSource {
  if (usedEditedLines) {
    return "user_override";
  }
  if (line.tax_rate_id) {
    return "tax";
  }
  const m = (line.memo ?? "").toLowerCase();
  if (
    m.includes("cogs") ||
    m.includes("inventory sale") ||
    m.includes("inventory purchase") ||
    m.includes("inventory:")
  ) {
    return "item";
  }
  return "system_default";
}
