import { describe, expect, it } from "vitest";
import {
  deriveDocumentTotalsForMaterialize,
  lineNetAmountFromInventoryLine,
} from "./materialize-amounts";

describe("deriveDocumentTotalsForMaterialize", () => {
  it("uses transaction_amounts when present", () => {
    expect(
      deriveDocumentTotalsForMaterialize({
        taxTreatment: "exclusive",
        entitiesAmount: 999,
        entitiesTaxAmount: null,
        draftTaxAmountFallback: undefined,
        transactionAmounts: {
          subtotal_amount: 100,
          tax_amount: 15,
          total_amount: 115,
        },
      }),
    ).toEqual({ subtotal: 100, taxAmount: 15, totalAmount: 115 });
  });

  it("exclusive: amount is net (subtotal), total = subtotal + tax", () => {
    expect(
      deriveDocumentTotalsForMaterialize({
        taxTreatment: "exclusive",
        entitiesAmount: 100,
        entitiesTaxAmount: 15,
        draftTaxAmountFallback: undefined,
        transactionAmounts: undefined,
      }),
    ).toEqual({ subtotal: 100, taxAmount: 15, totalAmount: 115 });
  });

  it("inclusive: amount is gross, subtotal = amount - tax", () => {
    expect(
      deriveDocumentTotalsForMaterialize({
        taxTreatment: "inclusive",
        entitiesAmount: 115,
        entitiesTaxAmount: 15,
        draftTaxAmountFallback: undefined,
        transactionAmounts: undefined,
      }),
    ).toEqual({ subtotal: 100, taxAmount: 15, totalAmount: 115 });
  });
});

describe("lineNetAmountFromInventoryLine", () => {
  it("prefers revenue_amount", () => {
    expect(
      lineNetAmountFromInventoryLine({
        item_id: "x",
        item_name: "A",
        quantity: 2,
        rate: 10,
        tax_rate: 15,
        tax_amount: 3,
        total: 23,
        revenue_amount: 20,
      }),
    ).toBe(20);
  });

  it("derives net from total - tax", () => {
    expect(
      lineNetAmountFromInventoryLine({
        item_id: "x",
        item_name: "A",
        quantity: 2,
        rate: 10,
        tax_rate: 15,
        tax_amount: 3,
        total: 23,
      }),
    ).toBe(20);
  });
});
