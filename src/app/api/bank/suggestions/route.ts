import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { suggestReconciliations } from "@/lib/data/bank";

const schema = z.object({
  amount: z.number(),
  description: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, description } = schema.parse(body);
    const matches = await suggestReconciliations(amount, description);
    return NextResponse.json({ matches });
  } catch (error) {
    console.error("Suggestion fetch failed", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to fetch suggestions" }, { status: 500 });
  }
}

