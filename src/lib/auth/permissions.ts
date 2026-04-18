/**
 * Central RBAC: two-layer enforcement uses this on the server.
 * UI may hide controls, but every sensitive server action must call `can()`.
 */

export type AppRole = "bookkeeper" | "accountant" | "admin" | "super_admin";

/** Server: RBAC_ENFORCEMENT_ENABLED. Client: NEXT_PUBLIC_RBAC_ENFORCEMENT_ENABLED (for UI hints only). */
export function isRbacEnforcementEnabled(): boolean {
  if (typeof window === "undefined") {
    return process.env.RBAC_ENFORCEMENT_ENABLED === "true";
  }
  return process.env.NEXT_PUBLIC_RBAC_ENFORCEMENT_ENABLED === "true";
}

export type PermissionAction =
  | "view_entries"
  | "view_audit_log"
  | "create_draft"
  | "edit_own_draft"
  | "edit_any_draft"
  | "submit_for_approval"
  | "approve_entry"
  | "unapprove_entry"
  | "post_entry"
  | "void_draft"
  | "void_posted"
  | "reverse_and_edit"
  | "manage_users"
  | "manage_chart_of_accounts"
  | "manage_company_settings"
  | "manage_contacts"
  | "merge_contacts"
  | "override_deactivation_block";

export type CanContext = {
  /** Required for reverse_and_edit when actor is admin (not super_admin). */
  allowAdminReverseAndEdit?: boolean;
};

const MATRIX: Record<AppRole, Record<PermissionAction, boolean>> = {
  bookkeeper: {
    view_entries: true,
    view_audit_log: false,
    create_draft: true,
    edit_own_draft: true,
    edit_any_draft: false,
    submit_for_approval: true,
    approve_entry: false,
    unapprove_entry: false,
    post_entry: false,
    void_draft: true,
    void_posted: false,
    reverse_and_edit: false,
    manage_users: false,
    manage_chart_of_accounts: false,
    manage_company_settings: false,
    manage_contacts: true,
    merge_contacts: false,
    override_deactivation_block: false,
  },
  accountant: {
    view_entries: true,
    view_audit_log: false,
    create_draft: true,
    edit_own_draft: true,
    edit_any_draft: true,
    submit_for_approval: true,
    approve_entry: true,
    unapprove_entry: true,
    post_entry: true,
    void_draft: true,
    void_posted: false,
    reverse_and_edit: false,
    manage_users: false,
    manage_chart_of_accounts: false,
    manage_company_settings: false,
    manage_contacts: true,
    merge_contacts: true,
    override_deactivation_block: false,
  },
  admin: {
    view_entries: true,
    view_audit_log: true,
    create_draft: true,
    edit_own_draft: true,
    edit_any_draft: true,
    submit_for_approval: true,
    approve_entry: true,
    unapprove_entry: true,
    post_entry: true,
    void_draft: true,
    void_posted: true,
    reverse_and_edit: false,
    manage_users: true,
    manage_chart_of_accounts: true,
    manage_company_settings: true,
    manage_contacts: true,
    merge_contacts: true,
    override_deactivation_block: true,
  },
  super_admin: {
    view_entries: true,
    view_audit_log: true,
    create_draft: true,
    edit_own_draft: true,
    edit_any_draft: true,
    submit_for_approval: true,
    approve_entry: true,
    unapprove_entry: true,
    post_entry: true,
    void_draft: true,
    void_posted: true,
    reverse_and_edit: true,
    manage_users: true,
    manage_chart_of_accounts: true,
    manage_company_settings: true,
    manage_contacts: true,
    merge_contacts: true,
    override_deactivation_block: true,
  },
};

/** Maps DB / legacy strings to AppRole after migrations. */
export function normalizeAppRole(raw: string | null | undefined): AppRole {
  const r = (raw ?? "").trim().toLowerCase();
  switch (r) {
    case "bookkeeper":
    case "business_user":
      return "bookkeeper";
    case "accountant":
    case "auditor":
      return "accountant";
    case "admin":
      return "admin";
    case "super_admin":
    case "superadmin":
      return "super_admin";
    default:
      return "bookkeeper";
  }
}

function matrixAllows(role: AppRole, action: PermissionAction, ctx: CanContext): boolean {
  if (action === "reverse_and_edit") {
    if (role === "super_admin") return true;
    if (role === "admin") return ctx.allowAdminReverseAndEdit === true;
    return false;
  }
  return MATRIX[role][action];
}

/** Legacy behavior when RBAC_ENFORCEMENT_ENABLED is false (matches pre-RBAC helpers). */
function legacyCan(role: AppRole, action: PermissionAction, ctx: CanContext): boolean {
  const adminLike = role === "admin" || role === "super_admin";
  const accountantLike = role === "accountant";

  switch (action) {
    case "view_entries":
    case "create_draft":
    case "edit_own_draft":
    case "submit_for_approval":
    case "manage_contacts":
      return true;
    case "approve_entry":
    case "unapprove_entry":
    case "post_entry":
      return adminLike || accountantLike;
    case "edit_any_draft":
    case "merge_contacts":
      return adminLike || accountantLike;
    case "view_audit_log":
      return adminLike || accountantLike;
    case "manage_chart_of_accounts":
      return adminLike || accountantLike;
    case "manage_users":
    case "manage_company_settings":
    case "override_deactivation_block":
      return adminLike;
    case "void_draft":
      return adminLike || accountantLike;
    case "void_posted":
      return adminLike || accountantLike;
    case "reverse_and_edit":
      return adminLike || accountantLike;
    default:
      return matrixAllows(role, action, ctx);
  }
}

export function can(
  role: string | null | undefined,
  action: PermissionAction,
  ctx: CanContext = {},
): boolean {
  const r = normalizeAppRole(role);
  if (!isRbacEnforcementEnabled()) {
    return legacyCan(r, action, ctx);
  }
  return matrixAllows(r, action, ctx);
}
