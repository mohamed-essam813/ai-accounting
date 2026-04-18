import { NextResponse } from "next/server";
import { parseInvoiceListQuery } from "@/lib/data/document-lists/parse-query";
import { queryInvoicesList } from "@/lib/data/document-lists/invoices-list";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const params = parseInvoiceListQuery(searchParams);
    const result = await queryInvoicesList(params);
    return NextResponse.json(result);
  } catch (e) {
    console.error("document-lists/invoices", e);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
