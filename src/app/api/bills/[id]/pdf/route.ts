import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";

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
    .select("name, tax_registration_number")
    .eq("id", user.tenant.id)
    .maybeSingle();

  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Bill ${(bill as { bill_number?: string | null }).bill_number ?? ""}`, 14, 16);
  doc.setFontSize(10);
  doc.text(String((tenant as { name?: string })?.name ?? "Company"), 14, 24);
  const trn = (tenant as { tax_registration_number?: string | null })?.tax_registration_number;
  if (trn) doc.text(`Tax registration: ${trn}`, 14, 30);
  doc.text(`Bill date: ${(bill as { bill_date: string }).bill_date}`, 14, trn ? 36 : 30);
  const due = (bill as { due_date?: string | null }).due_date;
  if (due) doc.text(`Due: ${due}`, 14, trn ? 42 : 36);

  const startY = trn ? (due ? 48 : 42) : due ? 42 : 36;

  const rows = (items ?? []).map((row) => {
    const r = row as {
      description: string | null;
      quantity: number;
      unit_cost: number;
      line_total: number;
    };
    return [
      r.description ?? "—",
      String(r.quantity),
      r.unit_cost.toFixed(2),
      r.line_total.toFixed(2),
    ];
  });

  autoTable(doc, {
    head: [["Description", "Qty", "Unit cost", "Line total"]],
    body:
      rows.length > 0
        ? rows
        : [
            [
              "Summary",
              "1",
              Number((bill as { subtotal: number }).subtotal).toFixed(2),
              Number((bill as { total_amount: number }).total_amount).toFixed(2),
            ],
          ],
    startY,
    styles: { fontSize: 9 },
  });

  const docExt = doc as unknown as { lastAutoTable?: { finalY: number } };
  const finalY = docExt.lastAutoTable?.finalY ?? startY + 40;
  doc.setFontSize(10);
  doc.text(
    `Subtotal: ${Number((bill as { subtotal: number }).subtotal).toFixed(2)}`,
    14,
    finalY + 10,
  );
  doc.text(
    `Tax: ${Number((bill as { tax_amount: number }).tax_amount).toFixed(2)}`,
    14,
    finalY + 16,
  );
  doc.text(
    `Total: ${Number((bill as { total_amount: number }).total_amount).toFixed(2)} ${(bill as { currency_code?: string | null }).currency_code ?? ""}`,
    14,
    finalY + 22,
  );

  const buf = doc.output("arraybuffer");
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bill-${id.slice(0, 8)}.pdf"`,
    },
  });
}
