import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DocumentNumberType = "invoice" | "bill" | "payment" | "receipt";

export async function nextDocumentNumber(params: {
  tenantId: string;
  documentType: DocumentNumberType;
  date: string; // YYYY-MM-DD
}): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as unknown as { rpc: (fn: string, args: unknown) => Promise<{ data: unknown; error: unknown }> }).rpc("next_document_number", {
    p_tenant_id: params.tenantId,
    p_document_type: params.documentType,
    p_date: params.date,
  });
  if (error) throw error;
  return String(data);
}

