import { describe, expect, it, afterEach } from "vitest";
import { can, isRbacEnforcementEnabled, normalizeAppRole } from "./permissions";

describe("normalizeAppRole", () => {
  it("maps legacy strings", () => {
    expect(normalizeAppRole("business_user")).toBe("bookkeeper");
    expect(normalizeAppRole("auditor")).toBe("accountant");
    expect(normalizeAppRole("admin")).toBe("admin");
    expect(normalizeAppRole("super_admin")).toBe("super_admin");
  });
});

describe("can()", () => {
  const prev = process.env.RBAC_ENFORCEMENT_ENABLED;

  afterEach(() => {
    process.env.RBAC_ENFORCEMENT_ENABLED = prev;
  });

  it("when RBAC off, accountant can post (legacy)", () => {
    process.env.RBAC_ENFORCEMENT_ENABLED = "false";
    expect(isRbacEnforcementEnabled()).toBe(false);
    expect(can("accountant", "post_entry")).toBe(true);
    expect(can("bookkeeper", "post_entry")).toBe(false);
  });

  it("when RBAC on, bookkeeper cannot post", () => {
    process.env.RBAC_ENFORCEMENT_ENABLED = "true";
    expect(can("bookkeeper", "post_entry")).toBe(false);
    expect(can("accountant", "post_entry")).toBe(true);
  });

  it("reverse_and_edit requires super_admin or admin+flag when RBAC on", () => {
    process.env.RBAC_ENFORCEMENT_ENABLED = "true";
    expect(can("super_admin", "reverse_and_edit")).toBe(true);
    expect(can("admin", "reverse_and_edit", { allowAdminReverseAndEdit: false })).toBe(false);
    expect(can("admin", "reverse_and_edit", { allowAdminReverseAndEdit: true })).toBe(true);
  });
});
