import { suggestBillLineClassification } from "@/lib/drafts/line-classification";
import type { BusinessItem } from "@/lib/data/inventory";

export type ParsedBillDraftLine = {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  classification: "inventory" | "expense" | "asset";
  confidence: number;
};

/**
 * Split free text into draft bill lines (e.g. "10 robot cleaners @ 2000" + "delivery 500").
 * Heuristic only — user confirms in UI.
 */
export function parseNaturalLanguageBillLines(text: string): ParsedBillDraftLine[] {
  const raw = text
    .split(/\n+/)
    .map((s) => s.replace(/^[\s\-*]+/, "").trim())
    .filter(Boolean);
  const out: ParsedBillDraftLine[] = [];

  for (const line of raw) {
    const qtyDescAt = line.match(
      /^(\d+(?:\.\d+)?)\s+(.+?)\s+@\s*([\d.,]+)\s*$/i,
    );
    if (qtyDescAt) {
      const qty = parseFloat(qtyDescAt[1]);
      const desc = qtyDescAt[2].trim();
      const up = parseFloat(qtyDescAt[3].replace(/,/g, ""));
      if (Number.isFinite(qty) && Number.isFinite(up)) {
        const lower = desc.toLowerCase();
        const isDelivery = /delivery|shipping|freight/.test(lower);
        out.push({
          description: desc,
          quantity: qty,
          unit_price: up,
          amount: null,
          classification: isDelivery ? "expense" : "inventory",
          confidence: isDelivery ? 0.55 : 0.72,
        });
        continue;
      }
    }

    const atMatch = line.match(
      /^(.+?)\s*(?:@|x|×)\s*([\d.,]+)\s*$/i,
    );
    const qtyPrice = line.match(
      /^([\d.,]+)\s*(?:x|×|\*)\s*(.+?)\s*(?:@|at)\s*([\d.,]+)\s*$/i,
    );
    if (qtyPrice) {
      const qty = parseFloat(qtyPrice[1].replace(/,/g, ""));
      const desc = qtyPrice[2].trim();
      const up = parseFloat(qtyPrice[3].replace(/,/g, ""));
      if (Number.isFinite(qty) && Number.isFinite(up)) {
        const lower = desc.toLowerCase();
        const isDelivery = /delivery|shipping|freight/.test(lower);
        out.push({
          description: desc,
          quantity: qty,
          unit_price: up,
          amount: null,
          classification: isDelivery ? "expense" : "inventory",
          confidence: isDelivery ? 0.55 : 0.65,
        });
        continue;
      }
    }
    if (atMatch) {
      const desc = atMatch[1].trim();
      const up = parseFloat(atMatch[2].replace(/,/g, ""));
      if (Number.isFinite(up)) {
        out.push({
          description: desc,
          quantity: 1,
          unit_price: up,
          amount: null,
          classification: "expense",
          confidence: 0.45,
        });
        continue;
      }
    }

    const numOnly = line.match(/^([\d.,]+)\s*$/);
    if (numOnly) {
      const amt = parseFloat(numOnly[1].replace(/,/g, ""));
      if (Number.isFinite(amt)) {
        out.push({
          description: "Line",
          quantity: null,
          unit_price: null,
          amount: amt,
          classification: "expense",
          confidence: 0.3,
        });
        continue;
      }
    }

    out.push({
      description: line,
      quantity: 1,
      unit_price: null,
      amount: null,
      classification: "expense",
      confidence: 0.25,
    });
  }

  return out.length > 0 ? out : [];
}

/** Refine classification when item is picked (inventory master). */
export function mergeBillLineWithItem(
  line: ParsedBillDraftLine,
  item: BusinessItem | null,
): ParsedBillDraftLine {
  if (!item) return line;
  const s = suggestBillLineClassification(item);
  return {
    ...line,
    classification: s.classification,
    confidence: Math.max(line.confidence, s.confidence),
  };
}
