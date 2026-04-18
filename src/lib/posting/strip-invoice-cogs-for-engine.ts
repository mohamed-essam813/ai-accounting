import type { JournalLine } from "@/lib/accounting";

/**
 * Removes AI/user-edited COGS debits and inventory relief credits that use the same accounts as the
 * inventory costing engine will post. Prevents duplicate lines when `edited_journal_lines` already
 * contained placeholder COGS/inventory amounts — amounts must come only from FIFO/WAC at post time.
 */
export function stripInvoiceCogsLinesForEngineRecompute(
  lines: JournalLine[],
  cogsAccountIds: Set<string>,
  inventoryAccountIds: Set<string>,
): JournalLine[] {
  if (cogsAccountIds.size === 0 && inventoryAccountIds.size === 0) return lines;
  return lines.filter((line) => {
    if (line.debit > 0 && line.credit === 0 && cogsAccountIds.has(line.account_id)) {
      return false;
    }
    if (line.credit > 0 && line.debit === 0 && inventoryAccountIds.has(line.account_id)) {
      return false;
    }
    return true;
  });
}
