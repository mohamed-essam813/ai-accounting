export type UserRole = "admin" | "accountant" | "business_user" | "auditor";

export const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  accountant: "Accountant",
  business_user: "Business User",
  auditor: "Auditor",
};

export function canApprove(role: UserRole) {
  return role === "admin" || role === "accountant";
}

export function canPost(role: UserRole) {
  return role === "admin" || role === "accountant";
}

export function canManageAccounts(role: UserRole) {
  return role === "admin";
}

