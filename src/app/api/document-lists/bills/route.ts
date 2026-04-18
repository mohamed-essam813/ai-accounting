import { NextResponse } from "next/server";
import { parseBillListQuery } from "@/lib/data/document-lists/parse-query";
import { queryBillsList } from "@/lib/data/document-lists/bills-list";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const params = parseBillListQuery(searchParams);
    const result = await queryBillsList(params);
    return NextResponse.json(result);
  } catch (e) {
    console.error("document-lists/bills", e);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
