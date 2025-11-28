import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getCurrentUser } from "@/lib/data/users";
import { extractTextFromImage } from "@/lib/ocr/vision";
import { z } from "zod";
import type { Database } from "@/lib/database.types";

type SourceDocument = Database["public"]["Tables"]["source_documents"]["Row"];

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const BUCKET_NAME = "receipts";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "File upload is required." }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File size exceeds the 10 MB limit." },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const serviceSupabase = createServiceSupabaseClient();
    const sanitizedName = file.name.replace(/\s+/g, "_");
    const storagePath = `${user.tenant.id}/${Date.now()}_${sanitizedName}`;

    const { error: uploadError } = await serviceSupabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      if (!uploadError.message.includes("already exists")) {
        console.error("Supabase storage upload failed", uploadError);
        return NextResponse.json(
          { error: "Failed to store file in Supabase Storage." },
          { status: 500 },
        );
      }
    }

    const vision = await extractTextFromImage(buffer);

    const { data: document, error: insertError } = await serviceSupabase
      .from("source_documents")
      .insert({
        tenant_id: user.tenant.id,
        created_by: user.id,
        file_path: storagePath,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        vision_text: vision.text,
        vision_json: vision.annotation,
      } as any)
      .select()
      .maybeSingle() as { data: SourceDocument | null; error: any };

    if (insertError) {
      console.error("Failed to record document metadata", insertError);
      return NextResponse.json(
        { error: "Failed to persist OCR metadata." },
        { status: 500 },
      );
    }

    await serviceSupabase.from("audit_logs").insert({
      tenant_id: user.tenant.id,
      actor_id: user.id,
      action: "ocr.uploaded",
      entity: "source_documents",
      entity_id: document?.id ?? null,
      changes: {
        fileName: file.name,
        storagePath,
        bytes: file.size,
      },
    } as any);

    return NextResponse.json({
      document: {
        id: document?.id,
        fileName: document?.file_name,
        storagePath: document?.file_path,
        mimeType: document?.mime_type,
        text: vision.text,
      },
    });
  } catch (error) {
    console.error("OCR upload failed", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to process OCR upload." }, { status: 500 });
  }
}

