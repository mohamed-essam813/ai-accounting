import { round2 } from "@/lib/posting/posting-engine";

export type SalesPdfLine = {
  description: string;
  quantity: number;
  /** Unit selling price (invoice) or unit cost (bill) — before tax. */
  unitFigure: number;
  /** Line amount before tax (matches document subtotal when single line). */
  lineNet: number;
};

export type SalesDocumentPdfKind = "invoice" | "bill";

async function tryLoadLogoDataUrl(logoUrl: string): Promise<
  | { dataUrl: string; format: "PNG" | "JPEG" }
  | null
> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    if (ct.includes("png")) {
      return { dataUrl: `data:image/png;base64,${base64}`, format: "PNG" };
    }
    if (ct.includes("jpeg") || ct.includes("jpg")) {
      return { dataUrl: `data:image/jpeg;base64,${base64}`, format: "JPEG" };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Shared PDF layout for invoices and bills: same structure, labels differ.
 * Line table: qty × unit ≈ line net (rounding); footer shows subtotal, tax, total.
 */
export async function renderSalesDocumentPdfBytes(params: {
  kind: SalesDocumentPdfKind;
  documentNumber: string;
  companyName: string;
  companyLegalName?: string | null;
  companyAddress?: string | null;
  companyLogoUrl?: string | null;
  taxRegistrationNumber?: string | null;
  documentDate: string;
  dueDate?: string | null;
  counterpartyName?: string | null;
  counterpartyAddress?: string | null;
  notes?: string | null;
  lines: SalesPdfLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currencyCode?: string | null;
  footerText?: string | null;
}): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const title = params.kind === "invoice" ? "INVOICE" : "BILL";
  const unitLabel = params.kind === "invoice" ? "Unit price" : "Unit cost";

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header block
  const logo = params.companyLogoUrl ? await tryLoadLogoDataUrl(params.companyLogoUrl) : null;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, 14, 12, 24, 24);
    } catch {
      // ignore logo failures
    }
  }

  const companyX = logo ? 42 : 14;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(String(params.companyLegalName || params.companyName || "Company"), companyX, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const addr = (params.companyAddress ?? "").trim();
  if (addr) {
    const lines = doc.splitTextToSize(addr, pageWidth - companyX - 14);
    doc.text(lines, companyX, 23);
  }
  const trn = (params.taxRegistrationNumber ?? "").trim();
  if (trn) doc.text(`Tax registration: ${trn}`, companyX, addr ? 23 + 5 * 2 : 23);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, pageWidth - 14, 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`No.: ${params.documentNumber || "—"}`, pageWidth - 14, 24, { align: "right" });
  doc.text(`Date: ${params.documentDate}`, pageWidth - 14, 29, { align: "right" });
  if (params.dueDate) doc.text(`Due: ${params.dueDate}`, pageWidth - 14, 34, { align: "right" });
  const cur = (params.currencyCode ?? "").trim();
  if (cur) doc.text(`Currency: ${cur}`, pageWidth - 14, params.dueDate ? 39 : 34, { align: "right" });

  // Counterparty
  const cpY = 48;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(params.kind === "invoice" ? "Bill to" : "Supplier", 14, cpY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(String(params.counterpartyName ?? "—"), 14, cpY + 5);
  if (params.counterpartyAddress) {
    const cpl = doc.splitTextToSize(String(params.counterpartyAddress), pageWidth - 28);
    doc.text(cpl, 14, cpY + 10);
  }

  const startY = 78;

  const st = round2(params.subtotal);
  const ta = round2(params.taxAmount);
  const tot = round2(params.totalAmount);

  const bodyRows =
    params.lines.length > 0
      ? params.lines.map((row) => [
          row.description,
          String(row.quantity),
          round2(row.unitFigure).toFixed(2),
          round2(row.lineNet).toFixed(2),
        ])
      : [
          [
            "Summary",
            "1",
            st.toFixed(2),
            st.toFixed(2),
          ],
        ];

  autoTable(doc, {
    head: [["Description", "Qty", unitLabel, "Line total"]],
    body: bodyRows,
    startY,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [20, 20, 20], textColor: 255 },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  const docExt = doc as unknown as { lastAutoTable?: { finalY: number } };
  const finalY = docExt.lastAutoTable?.finalY ?? startY + 40;
  const boxW = 70;
  const boxX = pageWidth - 14 - boxW;
  const boxY = finalY + 6;
  doc.setDrawColor(220);
  doc.rect(boxX, boxY, boxW, 22);
  doc.setFontSize(9);
  doc.text("Subtotal", boxX + 3, boxY + 6);
  doc.text(st.toFixed(2), boxX + boxW - 3, boxY + 6, { align: "right" });
  doc.text("Tax", boxX + 3, boxY + 12);
  doc.text(ta.toFixed(2), boxX + boxW - 3, boxY + 12, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text("Total", boxX + 3, boxY + 18);
  doc.text(tot.toFixed(2), boxX + boxW - 3, boxY + 18, { align: "right" });
  doc.setFont("helvetica", "normal");

  if (params.notes) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Notes", 14, boxY + 10);
    doc.setFont("helvetica", "normal");
    const n = doc.splitTextToSize(String(params.notes), pageWidth - 14 - (boxW + 18));
    doc.text(n, 14, boxY + 15);
  }

  const footer = (params.footerText ?? "").trim();
  doc.setFontSize(8);
  doc.setTextColor(120);
  const generated = `Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`;
  doc.text(footer || generated, 14, doc.internal.pageSize.getHeight() - 10);
  doc.setTextColor(0);

  return doc.output("arraybuffer");
}
