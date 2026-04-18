"use client";

import { Button } from "@/components/ui/button";
import type { DataIntegritySections } from "@/lib/data/data-integrity-reports";

type Payload = DataIntegritySections & {
  inventoryVsGl: { invSum: number; gl1200: number | null; variance1200: number | null };
};

function toCsv(rows: Record<string, string | number | boolean | null | undefined>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

export function DataIntegrityExport({ payload }: { payload: Payload }) {
  const download = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          download(
            "coa-suspects.csv",
            toCsv(
              payload.coaSuspects.map((r) => ({
                code: r.code,
                name: r.name,
                type: r.type,
                is_active: r.is_active,
                journal_lines: r.journalLineCount,
                reason: r.reason,
              })),
            ),
          )
        }
      >
        Export CoA CSV
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          download(
            "contact-pairs.csv",
            toCsv(
              payload.contactPairs.map((p) => ({
                similarity: p.similarity,
                name_a: p.nameA,
                code_a: p.codeA,
                name_b: p.nameB,
                code_b: p.codeB,
              })),
            ),
          )
        }
      >
        Export contacts CSV
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          download(
            "fixed-asset-dupes.csv",
            toCsv(
              payload.fixedDupes.flatMap((g) =>
                g.assetIds.map((id, i) => ({
                  group: g.nameKey,
                  cost: g.cost,
                  purchase_date: g.purchaseDate,
                  asset_id: id,
                  asset_name: g.names[i] ?? "",
                })),
              ),
            ),
          )
        }
      >
        Export asset dupes CSV
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          download(
            "inventory-service-candidates.csv",
            toCsv(
              payload.invCandidates.map((r) => ({
                id: r.id,
                name: r.name,
                item_type: r.item_type,
                inventory_tracked: r.inventory_tracked,
                reason: r.reason,
              })),
            ),
          )
        }
      >
        Export inventory candidates CSV
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          download(
            "fixed-asset-capitalization-audit.csv",
            toCsv(
              payload.faCapAudit.map((r) => ({
                asset_id: r.assetId,
                asset_name: r.assetName ?? "",
                cost: r.cost ?? "",
                account_code: r.accountCode ?? "",
                account_detail: r.accountDetailType ?? "",
              })),
            ),
          )
        }
      >
        Export FA capitalization CSV
      </Button>
    </div>
  );
}
