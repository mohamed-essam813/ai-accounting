import { describe, expect, it } from "vitest";
import {
  inferBillPurchaseTypeFromHeuristics,
  resolvePurchaseTypeForBillEditForm,
  getExplicitBillPurchaseType,
} from "./bill-purchase-classification";

const accounts = [
  { id: "inv-1", code: "1200", name: "Inventory", type: "asset", detail_type: null as string | null },
  { id: "exp-1", code: "5000", name: "Consulting Expense", type: "expense", detail_type: null },
  { id: "fa-1", code: "1500", name: "Equipment", type: "asset", detail_type: "fixed_asset" as const },
];

describe("inferBillPurchaseTypeFromHeuristics", () => {
  it("infers inventory from AI debit account code 1200", () => {
    const data = {
      ai_selected_accounts: {
        debit_account: { existing_account_id: "inv-1" },
      },
    };
    expect(inferBillPurchaseTypeFromHeuristics(data, accounts)).toBe("inventory");
  });

  it("infers expense from expense-type debit", () => {
    const data = {
      ai_selected_accounts: {
        debit_account: { existing_account_id: "exp-1" },
      },
    };
    expect(inferBillPurchaseTypeFromHeuristics(data, accounts)).toBe("expense");
  });

  it("infers asset from fixed_asset detail_type", () => {
    const data = {
      ai_selected_accounts: {
        debit_account: { existing_account_id: "fa-1" },
      },
    };
    expect(inferBillPurchaseTypeFromHeuristics(data, accounts)).toBe("asset");
  });

  it("infers inventory from selected_item_id", () => {
    const data = {
      selected_item_id: "00000000-0000-4000-8000-000000000099",
    };
    expect(inferBillPurchaseTypeFromHeuristics(data, [])).toBe("inventory");
  });

  it("infers from multi-line document_line_items classification", () => {
    const data = {
      document_line_items: [{ classification: "inventory" as const, description: "x", line_net: 100 }],
    };
    expect(inferBillPurchaseTypeFromHeuristics(data, [])).toBe("inventory");
  });
});

describe("resolvePurchaseTypeForBillEditForm", () => {
  it("uses explicit bill_purchase_type when it matches debit (expense + expense account)", () => {
    const data = {
      bill_purchase_type: "expense" as const,
      ai_selected_accounts: {
        debit_account: { existing_account_id: "exp-1" },
      },
    };
    expect(resolvePurchaseTypeForBillEditForm(data, accounts)).toBe("expense");
  });

  it("infers inventory when bill_purchase_type is absent but debit is 1200", () => {
    const data = {
      ai_selected_accounts: {
        debit_account: { existing_account_id: "inv-1" },
      },
    };
    expect(getExplicitBillPurchaseType(data)).toBeUndefined();
    expect(resolvePurchaseTypeForBillEditForm(data, accounts)).toBe("inventory");
  });

  it("recovers legacy expense default when debit and inventory signals match inventory", () => {
    const data = {
      bill_purchase_type: "expense" as const,
      classification_type: "EXPENSE",
      ai_selected_accounts: {
        debit_account: { existing_account_id: "inv-1" },
      },
    };
    expect(resolvePurchaseTypeForBillEditForm(data, accounts)).toBe("inventory");
  });
});
