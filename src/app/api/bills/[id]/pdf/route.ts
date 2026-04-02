import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { renderSalesDocumentPdfBytes } from "@/lib/pdf/sales-document-pdf";
import { round2 } from "@/lib/posting/posting-engine";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: bill, error: billErr } = await supabase
    .from("bills")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (billErr || !bill) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("bill_items")
    .select("*")
    .eq("bill_id", id)
    .order("created_at", { ascending: true });

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, legal_name, address, logo_url, tax_registration_number, document_footer_text")
    .eq("id", user.tenant.id)
    .maybeSingle();

  const supplierId = (bill as { supplier_id?: string | null }).supplier_id ?? null;
  const { data: supplier } = supplierId
    ? await supabase.from("contacts").select("name, address").eq("id", supplierId).maybeSingle()
    : { data: null };

  const lines = (items ?? []).map((row) => {
    const r = row as {
      description: string | null;
      quantity: number;
      unit_cost: number;
      line_total: number;
    };
    return {
      description: r.description ?? "—",
      quantity: Number(r.quantity),
      unitFigure: Number(r.unit_cost),
      lineNet: Number(r.line_total),
    };
  });

  // Validation: ensure stored lines/totals are internally consistent (no PDF-side recalculation)
  const subtotal = Number((bill as { subtotal: number }).subtotal);
  const taxAmount = Number((bill as { tax_amount: number }).tax_amount);
  const totalAmount = Number((bill as { total_amount: number }).total_amount);
  const sumLines = round2(lines.reduce((s, l) => s + Number(l.lineNet || 0), 0));
  if (lines.length > 0 && round2(subtotal) !== sumLines) {
    return NextResponse.json(
      { error: "PDF blocked: line totals do not match subtotal." },
      { status: 409 },
    );
  }
  if (round2(subtotal + taxAmount) !== round2(totalAmount)) {
    return NextResponse.json(
      { error: "PDF blocked: subtotal + tax does not match total." },
      { status: 409 },
    );
  }

  const buf = await renderSalesDocumentPdfBytes({
    kind: "bill",
    documentNumber: String((bill as { bill_number?: string | null }).bill_number ?? ""),
    companyName: String((tenant as { name?: string })?.name ?? "Company"),
    companyLegalName: (tenant as { legal_name?: string | null })?.legal_name ?? null,
    companyAddress: (tenant as { address?: string | null })?.address ?? null,
    companyLogoUrl: (tenant as { logo_url?: string | null })?.logo_url ?? null,
    taxRegistrationNumber: (tenant as { tax_registration_number?: string | null })?.tax_registration_number,
    documentDate: String((bill as { bill_date: string }).bill_date),
    dueDate: (bill as { due_date?: string | null }).due_date ?? null,
    counterpartyName: (supplier as { name?: string | null } | null)?.name ?? null,
    counterpartyAddress: (supplier as { address?: string | null } | null)?.address ?? null,
    notes: (bill as { note?: string | null }).note ?? null,
    lines,
    subtotal,
    taxAmount,
    totalAmount,
    currencyCode: (bill as { currency_code?: string | null }).currency_code ?? null,
    footerText: (tenant as { document_footer_text?: string | null })?.document_footer_text ?? null,
  });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bill-${id.slice(0, 8)}.pdf"`,
    },
  });
}
