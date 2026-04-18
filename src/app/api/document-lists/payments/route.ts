import { NextResponse } from "next/server";
import { parsePaymentListQuery } from "@/lib/data/document-lists/parse-query";
import { queryPaymentsList } from "@/lib/data/document-lists/payments-list";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const params = parsePaymentListQuery(searchParams);
    const result = await queryPaymentsList(params);
    return NextResponse.json(result);
  } catch (e) {
    console.error("document-lists/payments", e);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
