"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { saveDraftAction } from "@/lib/actions/drafts";
import { DraftSchema } from "@/lib/ai/schema";

const PromptFormSchema = z.object({
  prompt: z.string().min(10, "Provide at least 10 characters for parsing."),
});

type FormValues = z.infer<typeof PromptFormSchema>;

export function PromptComposer() {
  const [result, setResult] = useState<z.infer<typeof DraftSchema> | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, startSaving] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(PromptFormSchema),
    defaultValues: {
      prompt: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      setIsParsing(true);
      const response = await fetch("/api/prompt/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: values.prompt }),
      });

      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.error ?? "Failed to parse prompt";
        
        // Provide helpful guidance for schema errors
        if (errorMessage.includes("schema") || errorMessage.includes("couldn't be parsed")) {
          throw new Error(
            errorMessage + "\n\n" +
            "💡 Tip: Make sure your prompt includes:\n" +
            "- An accounting action (invoice, bill, payment, etc.)\n" +
            "- An amount and currency (e.g., $500 USD)\n" +
            "- A date (e.g., November 25, 2024 or 2024-11-25)\n\n" +
            "Example: 'Create an invoice for $500 USD to Acme Corp on November 25, 2024'"
          );
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setResult(data.draft);
      toast.success("Prompt parsed successfully", {
        description: "Review the draft and save it when ready.",
      });
    } catch (error) {
      console.error(error);
      toast.error("Prompt parsing failed", {
        description: error instanceof Error ? error.message : "Unknown error.",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = () => {
    if (!result) return;
    startSaving(async () => {
      try {
        await saveDraftAction({ ...result, rawPrompt: form.getValues("prompt") });
        toast.success("Draft saved", { description: "Draft added to approval queue." });
        setResult(null);
        form.reset();
      } catch (error) {
        console.error(error);
        toast.error("Failed to save draft", {
          description: error instanceof Error ? error.message : "Unknown error.",
        });
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Enter Accounting Prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Textarea
              rows={10}
              placeholder="Record an invoice for AED 5,000 to Al Faisal for consulting work delivered on 2025-10-01..."
              {...form.register("prompt")}
            />
            {form.formState.errors.prompt ? (
              <p className="text-sm text-destructive">{form.formState.errors.prompt.message}</p>
            ) : null}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isParsing}>
                {isParsing ? "Parsing..." : "Generate Draft"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!result || isSaving}
                onClick={handleSave}
              >
                {isSaving ? "Saving..." : "Save Draft"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Draft Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {result ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold capitalize">
                    {result.intent.replace("_", " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">Confidence score from the model.</p>
                </div>
                <Badge variant="outline">{Math.round(result.confidence * 100)}% confidence</Badge>
              </div>
              <pre className="max-h-[420px] overflow-auto rounded-md bg-muted p-4 text-xs leading-relaxed">
                {JSON.stringify(result.entities, null, 2)}
              </pre>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Submit a prompt to see the structured draft output from the AI parser.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

