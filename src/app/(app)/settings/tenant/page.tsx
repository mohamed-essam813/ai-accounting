import { redirect } from "next/navigation";

/** @deprecated Use /settings */
export default function LegacyTenantSettingsPage() {
  redirect("/settings");
}
