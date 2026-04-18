"use client";

import { useMemo } from "react";
import { can, type CanContext, type PermissionAction } from "@/lib/auth";

/**
 * Client-side permission hints. Server actions must still call `can()` — never rely on UI alone.
 * Set NEXT_PUBLIC_RBAC_ENFORCEMENT_ENABLED to mirror server RBAC_ENFORCEMENT_ENABLED for consistent UI.
 */
export function usePermissions(role: string | null | undefined) {
  return useMemo(
    () => ({
      can: (action: PermissionAction, ctx?: CanContext) => can(role, action, ctx),
    }),
    [role],
  );
}
