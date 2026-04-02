import { describe, expect, it } from "vitest";
import {
  accountIsArOrAp,
  accountMatchesContactStatementType,
  subledgerContactIdForLine,
} from "./ar-ap-subledger";

describe("ar-ap-subledger", () => {
  it("detects AR/AP by prd or legacy codes", () => {
    expect(accountIsArOrAp({ prd_account_kind: "accounts_payable", code: "2999" })).toBe(true);
    expect(accountIsArOrAp({ prd_account_kind: null, code: "2000" })).toBe(true);
    expect(accountIsArOrAp({ prd_account_kind: null, code: "5000" })).toBe(false);
  });

  it("matches statement account to vendor vs customer", () => {
    expect(
      accountMatchesContactStatementType("vendor", { prd_account_kind: "accounts_payable", code: "2000" }),
    ).toBe(true);
    expect(
      accountMatchesContactStatementType("vendor", { prd_account_kind: "accounts_receivable", code: "1100" }),
    ).toBe(false);
    expect(
      accountMatchesContactStatementType("customer", { prd_account_kind: null, code: "1100" }),
    ).toBe(true);
  });

  it("sets contact only on AR/AP lines", () => {
    const cid = "00000000-0000-4000-8000-000000000099";
    expect(subledgerContactIdForLine({ prd_account_kind: "accounts_payable", code: "2000" }, cid)).toBe(cid);
    expect(subledgerContactIdForLine({ prd_account_kind: null, code: "5000" }, cid)).toBe(null);
    expect(subledgerContactIdForLine({ prd_account_kind: "accounts_payable", code: "2000" }, null)).toBe(null);
  });
});
