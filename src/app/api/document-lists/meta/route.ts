import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/users";
import { getCompanySettings } from "@/lib/data/company-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, supabase] = await Promise.all([getCompanySettings(), createServerSupabaseClient()]);

  const { data: users } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("tenant_id", user.tenant.id)
    .order("email");

  return NextResponse.json({
    companyName: settings?.company_name ?? "Company",
    approvalEnabled: settings?.require_approval_before_posting ?? false,
    users: (users ?? []).map((u) => ({ id: u.id, label: u.email })),
  });
}
