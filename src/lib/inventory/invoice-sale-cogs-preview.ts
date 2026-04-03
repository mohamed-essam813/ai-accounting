/**
 * Read-only COGS + inventory reduction journal lines for invoice draft preview.
 * Mirrors posting logic without mutating inventory balances.
 */

import type { JournalLine } from "@/lib/accounting";
import { round2 } from "@/lib/posting/posting-engine";
import type { DraftInventoryLine } from "@/lib/posting/materialize-amounts";
import { calculateCOGSFIFO, calculateCOGSWeightedAverage } from "@/lib/inventory/valuation";
import { getInventoryItem } from "@/lib/data/inventory";

export async function appendCogsLinesForSalePreview(params: {
  tenantId: string;
  entryDate: string;
  inventoryLines: Array<DraftInventoryLine & { item_name: string }>;
  journalLines: JournalLine[];
}): Promise<JournalLine[]> {
  const { tenantId, entryDate, inventoryLines } = params;
  let lines = [...params.journalLines];

  for (const lineItem of inventoryLines) {
    const inventoryItem = await getInventoryItem(lineItem.item_id);
    if (!inventoryItem) {
      throw new Error(`Inventory item not found for line (“${lineItem.item_name}”).`);
    }

    const inventoryItemWithAccounts = inventoryItem as {
      inventory_account_id?: string | null;
      cogs_account_id?: string | null;
      name?: string;
      valuation_method?: string;
    };
    const inventoryAccountId = inventoryItemWithAccounts.inventory_account_id;
    const cogsAccountId = inventoryItemWithAccounts.cogs_account_id;

    if (!inventoryAccountId || !cogsAccountId) {
      throw new Error(
        `Line item “${lineItem.item_name}” is missing inventory or COGS account mapping.`,
      );
    }

    let cogsAmount = 0;
    if (inventoryItem.valuation_method === "fifo") {
      cogsAmount = await calculateCOGSFIFO(tenantId, lineItem.item_id, lineItem.quantity, entryDate);
    } else {
      cogsAmount = await calculateCOGSWeightedAverage(tenantId, lineItem.item_id, lineItem.quantity);
    }

    const amt = round2(cogsAmount);

    lines.push({
      account_id: cogsAccountId,
      debit: amt,
      credit: 0,
      memo: `COGS (preview): ${lineItem.item_name} (${lineItem.quantity})`,
    });

    const inventoryLineIndex = lines.findIndex(
      (line) => line.account_id === inventoryAccountId && line.credit > 0,
    );

    if (inventoryLineIndex >= 0) {
      lines[inventoryLineIndex] = {
        ...lines[inventoryLineIndex],
        credit: round2(lines[inventoryLineIndex].credit + amt),
        memo: `${lines[inventoryLineIndex].memo || ""}; Sale: ${lineItem.item_name}`.trim(),
      };
    } else {
      lines.push({
        account_id: inventoryAccountId,
        debit: 0,
        credit: amt,
        memo: `Inventory reduction (preview): ${lineItem.item_name} (${lineItem.quantity})`,
      });
    }
  }

  return lines;
}
