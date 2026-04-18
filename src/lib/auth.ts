import {
  can as canPermission,
  normalizeAppRole,
  type AppRole,
  type CanContext,
  type PermissionAction,
} from "@/lib/auth/permissions";

export type { AppRole, PermissionAction, CanContext };

/** @deprecated Prefer AppRole — kept for gradual migration of components. */
export type UserRole = AppRole;

export const roleLabels: Record<AppRole, string> = {
  bookkeeper: "Bookkeeper",
  accountant: "Accountant",
  admin: "Admin",
  super_admin: "Super Admin",
};

/** Central permission check — use from server actions and API routes. */
export function can(role: string | null | undefined, action: PermissionAction, ctx?: CanContext): boolean {
  return canPermission(role, action, ctx);
}

export function normalizeRole(raw: string | null | undefined): AppRole {
  return normalizeAppRole(raw);
}

export function isTenantAdminRole(role: string | null | undefined): boolean {
  const r = normalizeAppRole(role);
  return r === "admin" || r === "super_admin";
}

/** Legacy: approver for journals/drafts (admin, accountant, super_admin). */
export function canApprove(role: string | null | undefined): boolean {
  return can(role, "approve_entry");
}

/** Legacy: post to ledger. */
export function canPost(role: string | null | undefined): boolean {
  return can(role, "post_entry");
}

/** Company / tenant administration (settings, subscriptions, invites in legacy sense). */
export function canManageAccounts(role: string | null | undefined): boolean {
  return can(role, "manage_company_settings");
}

/** Posted draft convert / reverse-edit style operations (legacy naming). */
export function canEditPosted(role: string | null | undefined): boolean {
  const r = normalizeAppRole(role);
  return r === "admin" || r === "super_admin" || r === "accountant";
}
