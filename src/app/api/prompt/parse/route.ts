import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseAccountingPrompt } from "@/lib/ai";
import { DraftSchema } from "@/lib/ai/schema";
import { getCurrentUser } from "@/lib/data/users";

const requestSchema = z.object({
  prompt: z.string().min(10, "Provide more details for the accounting prompt."),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { prompt } = requestSchema.parse(json);

    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = await parseAccountingPrompt(prompt, {
      tenantId: user.tenant.id,
      userId: user.id,
    });

    const validation = DraftSchema.safeParse(parsed);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Model returned invalid schema", issues: validation.error.issues },
        { status: 422 },
      );
    }

    return NextResponse.json({ draft: validation.data });
  } catch (error) {
    console.error("Prompt parsing failed", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof Error) {
      // Return the actual error message for better debugging
      return NextResponse.json(
        { error: error.message || "Failed to parse prompt" },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "Failed to parse prompt", details: "Unknown error occurred" },
      { status: 500 },
    );
  }
}

