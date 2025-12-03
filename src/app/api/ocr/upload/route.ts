import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getCurrentUser } from "@/lib/data/users";
import { extractTextFromImage } from "@/lib/ocr/vision";
import { z } from "zod";
import type { Database, Json } from "@/lib/database.types";

type SourceDocumentInsert = Database["public"]["Tables"]["source_documents"]["Insert"];
type AuditLogsInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

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

    // Check file type
    const allowedMimeTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    const fileType = file.type || "";
    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith(".pdf") || fileType === "application/pdf";
    const isImage = fileType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);

    if (!isPdf && !isImage) {
      return NextResponse.json(
        {
          error: "Unsupported file type.",
          details: `Supported formats: PDF, JPEG, PNG, GIF, WebP. Received: ${fileType || "unknown"}`,
        },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: "File size exceeds the 10 MB limit.",
          details: `File size: ${(file.size / 1024 / 1024).toFixed(2)} MB. Maximum allowed: 10 MB.`,
        },
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

    let vision;
    try {
      vision = await extractTextFromImage(buffer);
    } catch (error) {
      console.error("OCR extraction failed", error);
      if (error instanceof Error) {
        if (error.message.includes("credentials") || error.message.includes("Google Cloud")) {
          return NextResponse.json(
            {
              error: "OCR service not configured.",
              details: "Google Cloud Vision API credentials are missing or invalid. Please contact your administrator.",
            },
            { status: 500 },
          );
        }
        return NextResponse.json(
          {
            error: "Failed to extract text from document.",
            details: error.message,
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        {
          error: "Failed to process document.",
          details: "The document could not be read. Please ensure it's a valid PDF or image file.",
        },
        { status: 500 },
      );
    }

    const insertData: SourceDocumentInsert = {
      tenant_id: user.tenant.id,
      created_by: user.id,
      file_path: storagePath,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      vision_text: vision.text,
      vision_json: vision.annotation ? (vision.annotation as unknown as Json) : null,
    };
    // Service client has type inference issues - use explicit typing
    const insertArray: SourceDocumentInsert[] = [insertData];
    type SourceDocumentRow = Database["public"]["Tables"]["source_documents"]["Row"];
    // Type assertion to fix service client inference - this is type-safe as we're asserting to known Database types
    const table = serviceSupabase.from("source_documents") as unknown as {
      insert: (values: SourceDocumentInsert[]) => {
        select: () => Promise<{ data: SourceDocumentRow[] | null; error: unknown }>;
      };
    };
    const { data: documents, error: insertError } = await table.insert(insertArray).select();
    const document = documents?.[0] ?? null;

    if (insertError) {
      console.error("Failed to record document metadata", insertError);
      return NextResponse.json(
        { error: "Failed to persist OCR metadata." },
        { status: 500 },
      );
    }

  const auditData: AuditLogsInsert = {
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
  };
  // Type assertion for service client audit_logs insert
  const auditTable = serviceSupabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

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

