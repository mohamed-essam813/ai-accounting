import type { Database } from "@/lib/database.types";

type Account = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

export type PreviewJournalLine = {
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  memo?: string | null;
};

function isCogsAccount(acc: Account): boolean {
  if ((acc as { is_cogs?: boolean }).is_cogs === true) return true;
  return acc.type === "expense" && (acc.code ?? "").trim() === "5500";
}

/**
 * Debit account id for supplier bill sub-forms — derived from posted journal preview lines (same source as Journal Preview tab).
 */
export function pickBillDebitAccountIdFromPreview(
  purchaseType: "expense" | "inventory" | "asset",
  lines: PreviewJournalLine[],
  accounts: Account[],
): string | null {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const debits = lines.filter((l) => l.debit > 0 && l.credit === 0);

  if (purchaseType === "asset") {
    for (const line of debits) {
      const acc = byId.get(line.account_id);
      if (acc?.type === "asset" && acc.detail_type === "fixed_asset") return line.account_id;
    }
    for (const line of debits) {
      const acc = byId.get(line.account_id);
      if (acc?.type === "asset" && !isCogsAccount(acc)) return line.account_id;
    }
  }

  if (purchaseType === "inventory") {
    for (const line of debits) {
      const acc = byId.get(line.account_id);
      if (!acc || acc.type !== "asset") continue;
      if (acc.detail_type === "fixed_asset") continue;
      if (/\binventory\b/i.test(acc.name ?? "") || (acc.code ?? "").trim().startsWith("120")) {
        return line.account_id;
      }
    }
    for (const line of debits) {
      const acc = byId.get(line.account_id);
      if (acc?.type === "asset") return line.account_id;
    }
  }

  for (const line of debits) {
    const acc = byId.get(line.account_id);
    if (acc?.type === "expense" && !isCogsAccount(acc)) return line.account_id;
  }

  return debits[0]?.account_id ?? null;
}

export function readAssetFieldsFromDocumentLines(
  data: Record<string, unknown>,
): { name: string; category: string } | null {
  const doc = data.document_line_items as
    | Array<{ classification?: string; asset?: { name?: string; category?: string } }>
    | undefined;
  if (!Array.isArray(doc)) return null;
  const row = doc.find((l) => l.classification === "asset" && l.asset);
  if (!row?.asset) return null;
  const name = row.asset.name?.trim() ?? "";
  const category = row.asset.category?.trim() ?? "";
  if (!name && !category) return null;
  return { name, category };
}

export function readInventoryLineFromEntities(data: Record<string, unknown>): {
  quantity?: number;
  unit_price?: number;
} {
  const inv = data.inventory_line_items as Array<{ quantity?: number; unit_price?: number; rate?: number }> | undefined;
  const first = inv?.[0];
  if (!first) return {};
  const unit = first.unit_price ?? first.rate;
  return {
    quantity: typeof first.quantity === "number" ? first.quantity : undefined,
    unit_price: typeof unit === "number" ? unit : undefined,
  };
}
