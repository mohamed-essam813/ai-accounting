import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/users";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const kind = searchParams.get("kind") as "customer" | "vendor" | "all" | null;

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("contacts")
    .select("id, name, code, trn, is_customer, is_vendor")
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true)
    .order("name")
    .limit(80);

  if (kind === "customer") query = query.eq("is_customer", true);
  if (kind === "vendor") query = query.eq("is_vendor", true);

  const { data, error } = await query;
  if (error) {
    console.error("contacts search", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  let rows = (data ?? []) as Array<{
    id: string;
    name: string;
    code: string;
    trn: string | null;
    is_customer: boolean;
    is_vendor: boolean;
  }>;

  if (q) {
    rows = rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.trn && c.trn.toLowerCase().includes(q)),
    );
  }

  return NextResponse.json({ contacts: rows.slice(0, 50) });
}
