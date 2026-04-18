import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { matchDuplicateCandidate } from "@/lib/fixed-assets/duplicate-assets-matcher";

type FaRow = Pick<
  Database["public"]["Tables"]["fixed_assets"]["Row"],
  "id" | "name" | "cost" | "purchase_date"
>;

const MS_DAY = 86400000;

export { matchDuplicateCandidate } from "./duplicate-assets-matcher";

export type DuplicateRow = { id: string; name: string; cost: number; purchaseDate: string };

/**
 * Fetches a window of same-cost assets for a tenant, then matches in process.
 */
export async function listPossibleDuplicateFixedAssets(
  tenantId: string,
  name: string,
  cost: number,
  purchaseDate: string,
): Promise<DuplicateRow[]> {
  const supabase = await createServerSupabaseClient();
  const t = new Date(purchaseDate + "T12:00:00");
  if (Number.isNaN(t.getTime())) return [];
  const from = new Date(t.getTime() - 8 * MS_DAY).toISOString().slice(0, 10);
  const to = new Date(t.getTime() + 8 * MS_DAY).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("fixed_assets")
    .select("id, name, cost, purchase_date")
    .eq("tenant_id", tenantId)
    .is("disposed_at", null)
    .gte("cost", cost - 0.02)
    .lte("cost", cost + 0.02)
    .gte("purchase_date", from)
    .lte("purchase_date", to);

  if (error) throw error;
  const out: DuplicateRow[] = [];
  for (const row of data ?? []) {
    if (matchDuplicateCandidate({ name, cost, purchaseDate }, row as FaRow)) {
      out.push({
        id: row.id,
        name: row.name,
        cost: Number(row.cost),
        purchaseDate: row.purchase_date,
      });
    }
  }
  return out;
}
