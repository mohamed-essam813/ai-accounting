/**
 * Bank Reconciliation = PDF-only.
 * POST: accept bank statement PDF, extract text, parse into transactions.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/users";
import {
  parseBankStatementText,
  parseBankStatementTables,
} from "@/lib/bank/parse-pdf-statements";

export const runtime = "nodejs";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "PDF file is required." },
        { status: 400 }
      );
    }

    const fileType = file.type || "";
    const fileName = file.name.toLowerCase();
    const isPdf =
      fileName.endsWith(".pdf") || fileType === "application/pdf";

    if (!isPdf) {
      return NextResponse.json(
        {
          error: "Only PDF bank statements are supported.",
          details: `Received: ${fileType || "unknown"}. Upload a PDF export of your bank statement.`,
        },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: "File too large.",
          details: `Maximum size: ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`,
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });

    let transactions: { date: string; description: string; amount: number; counterparty?: string | null }[] = [];

    try {
      const tableResult = await parser.getTable();
      const merged = (tableResult as { mergedTables?: string[][][] })?.mergedTables ?? [];
      if (merged.length > 0) {
        transactions = parseBankStatementTables(merged);
      }
    } catch {
      /* ignore table errors, fall back to text */
    }

    if (transactions.length === 0) {
      const textResult = await parser.getText();
      const text = (textResult as { text?: string })?.text ?? "";
      transactions = parseBankStatementText(text);
    }

    await parser.destroy();

    if (transactions.length === 0) {
      return NextResponse.json(
        {
          error: "No transactions could be extracted.",
          details:
            "Ensure the PDF is a bank statement with Date, Description, and Amount columns. Supported formats: table or plain text with dates and amounts.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      transactions,
      fileName: file.name,
      parsedCount: transactions.length,
    });
  } catch (e) {
    console.error("Bank PDF parse error:", e);
    return NextResponse.json(
      {
        error: "Failed to parse PDF.",
        details:
          e instanceof Error
            ? e.message
            : "Ensure the file is a valid bank statement PDF.",
      },
      { status: 500 }
    );
  }
}
