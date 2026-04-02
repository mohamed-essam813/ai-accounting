import { round2 } from "@/lib/posting/posting-engine";

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
    if (ct.includes("png")) return { dataUrl: `data:image/png;base64,${base64}`, format: "PNG" };
    if (ct.includes("jpeg") || ct.includes("jpg"))
      return { dataUrl: `data:image/jpeg;base64,${base64}`, format: "JPEG" };
    return null;
  } catch {
    return null;
  }
}

export async function renderVoucherPdfBytes(params: {
  kind: "payment" | "receipt";
  voucherNumber: string;
  companyName: string;
  companyLegalName?: string | null;
  companyAddress?: string | null;
  companyLogoUrl?: string | null;
  taxRegistrationNumber?: string | null;
  voucherDate: string;
  counterpartyLabel: string;
  counterpartyName: string;
  counterpartyAddress?: string | null;
  currencyCode?: string | null;
  amount: number;
  reference?: string | null;
  footerText?: string | null;
}): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const title = params.kind === "receipt" ? "RECEIPT VOUCHER" : "PAYMENT VOUCHER";

  const logo = params.companyLogoUrl ? await tryLoadLogoDataUrl(params.companyLogoUrl) : null;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, 14, 12, 24, 24);
    } catch {
      // ignore
    }
  }
  const companyX = logo ? 42 : 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(String(params.companyLegalName || params.companyName || "Company"), companyX, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const addr = (params.companyAddress ?? "").trim();
  if (addr) doc.text(doc.splitTextToSize(addr, pageWidth - companyX - 14), companyX, 23);
  const trn = (params.taxRegistrationNumber ?? "").trim();
  if (trn) doc.text(`Tax registration: ${trn}`, companyX, addr ? 33 : 23);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, pageWidth - 14, 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`No.: ${params.voucherNumber || "—"}`, pageWidth - 14, 24, { align: "right" });
  doc.text(`Date: ${params.voucherDate}`, pageWidth - 14, 29, { align: "right" });
  const cur = (params.currencyCode ?? "").trim();
  if (cur) doc.text(`Currency: ${cur}`, pageWidth - 14, 34, { align: "right" });

  // Counterparty + amount block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(params.counterpartyLabel, 14, 54);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(params.counterpartyName || "—", 14, 59);
  if (params.counterpartyAddress) {
    doc.text(doc.splitTextToSize(String(params.counterpartyAddress), pageWidth - 28), 14, 64);
  }

  const amountBoxX = pageWidth - 14 - 80;
  const amountBoxY = 52;
  doc.setDrawColor(220);
  doc.rect(amountBoxX, amountBoxY, 80, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Amount", amountBoxX + 3, amountBoxY + 6);
  doc.setFont("helvetica", "bold");
  doc.text(`${round2(params.amount).toFixed(2)} ${cur}`.trim(), amountBoxX + 77, amountBoxY + 13, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");

  if (params.reference) {
    doc.setFont("helvetica", "bold");
    doc.text("Reference / Notes", 14, 92);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(String(params.reference), pageWidth - 28), 14, 98);
  }

  const footer = (params.footerText ?? "").trim();
  doc.setFontSize(8);
  doc.setTextColor(120);
  const generated = `Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`;
  doc.text(footer || generated, 14, pageHeight - 10);
  doc.setTextColor(0);

  return doc.output("arraybuffer");
}

