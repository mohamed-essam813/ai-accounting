import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { renderVoucherPdfBytes } from "@/lib/pdf/voucher-pdf";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user?.tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createServerSupabaseClient();
  const { data: p, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error || !p) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if ((p as { payment_type?: string }).payment_type !== "payment") {
    return NextResponse.json({ error: "Not a supplier payment" }, { status: 409 });
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, legal_name, address, logo_url, tax_registration_number, document_footer_text")
    .eq("id", user.tenant.id)
    .maybeSingle();

  const contactId = (p as { contact_id?: string | null }).contact_id ?? null;
  const { data: contact } = contactId
    ? await supabase.from("contacts").select("name, address").eq("id", contactId).maybeSingle()
    : { data: null };

  const buf = await renderVoucherPdfBytes({
    kind: "payment",
    voucherNumber: String((p as { voucher_number?: string | null }).voucher_number ?? ""),
    companyName: String((tenant as { name?: string })?.name ?? "Company"),
    companyLegalName: (tenant as { legal_name?: string | null })?.legal_name ?? null,
    companyAddress: (tenant as { address?: string | null })?.address ?? null,
    companyLogoUrl: (tenant as { logo_url?: string | null })?.logo_url ?? null,
    taxRegistrationNumber: (tenant as { tax_registration_number?: string | null })?.tax_registration_number,
    voucherDate: String((p as { payment_date: string }).payment_date),
    counterpartyLabel: "Paid to",
    counterpartyName: String((contact as { name?: string | null } | null)?.name ?? "—"),
    counterpartyAddress: (contact as { address?: string | null } | null)?.address ?? null,
    currencyCode: (p as { currency_code?: string | null }).currency_code ?? null,
    amount: Number((p as { amount: number }).amount),
    reference: (p as { reference?: string | null }).reference ?? null,
    footerText: (tenant as { document_footer_text?: string | null })?.document_footer_text ?? null,
  });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="payment-${id.slice(0, 8)}.pdf"`,
    },
  });
}

