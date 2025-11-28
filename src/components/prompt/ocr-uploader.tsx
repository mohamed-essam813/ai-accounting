"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type OcrResult = {
  fileName: string;
  text: string;
};

export function OcrUploader() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [isUploading, startUpload] = useTransition();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const handleSubmit = () => {
    if (!selectedFile) {
      toast.error("Select a PDF or image file to upload.");
      return;
    }

    startUpload(async () => {
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);

        const response = await fetch("/api/ocr/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Failed to process OCR upload.");
        }

        setResult({ fileName: data.document.fileName, text: data.document.text });
        toast.success("OCR complete", {
          description: "Text extracted successfully. Review and adjust before using it in prompts.",
        });
        router.refresh();
      } catch (error) {
        console.error(error);
        toast.error("OCR upload failed", {
          description: error instanceof Error ? error.message : "Unknown error occurred.",
        });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Document for OCR</CardTitle>
        <CardDescription>
          Extract invoice or receipt details using Google Cloud Vision. Supported formats: PDF, PNG,
          JPG. Maximum size 10 MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          type="file"
          accept=".pdf,image/png,image/jpeg,image/jpg"
          onChange={handleFileChange}
        />
        <Button onClick={handleSubmit} disabled={isUploading}>
          {isUploading ? "Processing..." : "Upload & Extract"}
        </Button>
        {result ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Extracted text from {result.fileName}</p>
            <Textarea value={result.text} readOnly rows={10} className="font-mono text-xs" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

