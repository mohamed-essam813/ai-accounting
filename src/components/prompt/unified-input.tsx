/**
 * Unified Input Component
 * Feedback: Merge text input and file upload into one unified area
 * Business-oriented labeling: "Tell us what happened"
 */

"use client";

import { useState, useTransition, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, X, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { AccountConfirmationDialog } from "./account-confirmation-dialog";
import { CashBankSelectionDialog } from "./cash-bank-selection-dialog";
import { CashContextConfirmationDialog } from "./cash-context-confirmation-dialog";

const UnifiedInputSchema = z.object({
  prompt: z.string().min(1, "Please describe what happened."),
});

type FormValues = z.infer<typeof UnifiedInputSchema>;

type UploadedFile = {
  file: File;
  id: string;
};

type Props = {
  onDraftCreated?: (draftId: string) => void;
};

export function UnifiedInput({ onDraftCreated }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isProcessing, startProcessing] = useTransition();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [accountConfirmation, setAccountConfirmation] = useState<{
    key: string;
    data: any;
  } | null>(null);
  const [cashContextConfirmation, setCashContextConfirmation] = useState<{
    required: boolean;
    transactionDescription?: string;
  } | null>(null);
  const [cashBankSelection, setCashBankSelection] = useState<{
    bankAccounts: Array<{ id: string; name: string; code: string }>;
    cashAccount: { id: string; name: string; code: string } | null;
    accountKey: "debit_account" | "credit_account";
  } | null>(null);
  const [pendingDraftData, setPendingDraftData] = useState<any>(null);
  // Use ref to track if we're transitioning to bank selection (prevents onClose from clearing state)
  const isTransitioningToBankSelection = useRef(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(UnifiedInputSchema),
    defaultValues: {
      prompt: "",
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newFiles: UploadedFile[] = Array.from(files).map((file) => ({
      file,
      id: `${Date.now()}-${Math.random()}`,
    }));

    setUploadedFiles((prev) => [...prev, ...newFiles]);
    
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const onSubmit = async (values: FormValues) => {
    if (!values.prompt.trim() && uploadedFiles.length === 0) {
      toast.error("Please describe what happened or upload a document.");
      return;
    }

    startProcessing(async () => {
      try {
        // First, upload files if any (silently, no OCR terminology)
        const fileIds: string[] = [];
        if (uploadedFiles.length > 0) {
          for (const uploadedFile of uploadedFiles) {
            try {
              const formData = new FormData();
              formData.append("file", uploadedFile.file);

              const uploadResponse = await fetch("/api/ocr/upload", {
                method: "POST",
                body: formData,
              });

              if (uploadResponse.ok) {
                const uploadData = await uploadResponse.json();
                if (uploadData.document?.id) {
                  fileIds.push(uploadData.document.id);
                }
              }
            } catch (error) {
              console.error("File upload failed:", error);
              // Continue with other files even if one fails
            }
          }
        }

        // Combine text prompt with file context
        let combinedPrompt = values.prompt;
        if (uploadedFiles.length > 0) {
          // If files were uploaded, the system will use them as context
          // We don't expose this to the user
          combinedPrompt = values.prompt || "Process the uploaded documents";
        }

        // Parse the prompt (system handles text + files silently)
        const response = await fetch("/api/prompt/parse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            prompt: combinedPrompt,
            documentIds: fileIds.length > 0 ? fileIds : undefined,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error ?? "Failed to process your request.");
        }

        const data = await response.json();

        // STEP 1: Check if cash context confirmation is needed (HIGHEST PRIORITY)
        // This is mandatory for ALL potential cash/bank transactions
        if (data.cashContextConfirmation?.required) {
          // Store draft data for after cash context confirmation
          setPendingDraftData({
            draft: data.draft,
            contactId: data.contactId,
            rawPrompt: values.prompt,
            documentIds: fileIds,
            originalAccountConfirmations: data.accountConfirmation || {},
            accountConfirmations: {},
            cashBankSelection: data.cashBankSelection, // Store for later if needed
          });
          
          // Show cash context confirmation dialog (STEP 1)
          setCashContextConfirmation(data.cashContextConfirmation);
          return; // Wait for user confirmation
        }

        // STEP 2: Check if cash/bank selection is needed (after cash context confirmed)
        if (data.cashBankSelection) {
          // Store draft data for after cash/bank selection
          setPendingDraftData({
            draft: data.draft,
            contactId: data.contactId,
            rawPrompt: values.prompt,
            documentIds: fileIds,
            originalAccountConfirmations: data.accountConfirmation || {},
            accountConfirmations: {},
          });
          
          // Show cash/bank selection dialog
          setCashBankSelection(data.cashBankSelection);
          return; // Wait for user selection
        }

        // Check if account confirmation is needed
        if (data.accountConfirmation && Object.keys(data.accountConfirmation).length > 0) {
          // Store draft data and all confirmation data
          setPendingDraftData({
            draft: data.draft,
            contactId: data.contactId,
            rawPrompt: values.prompt,
            documentIds: fileIds,
            originalAccountConfirmations: data.accountConfirmation,
            accountConfirmations: {},
          });
          
          // Show first account confirmation (debit_account, then credit_account, etc.)
          const firstKey = Object.keys(data.accountConfirmation)[0];
          setAccountConfirmation({
            key: firstKey,
            data: data.accountConfirmation[firstKey],
          });
          return; // Wait for user confirmation
        }

        // No confirmation needed, proceed with draft creation
        await createDraftWithAccounts(data.draft, data.contactId, values.prompt, fileIds);
      } catch (error) {
        console.error(error);
        toast.error("Failed to process your request", {
          description: error instanceof Error ? error.message : "Please try again.",
        });
      }
    });
  };

  const handleDraftUpdated = () => {
    // Refresh the draft data if needed
    router.refresh();
  };

  const handleClosePanel = () => {
    setDraftId(null);
    setDocumentIds([]);
    form.reset();
    setUploadedFiles([]);
  };

  const handleCashContextConfirmation = async (isCashBank: boolean) => {
    if (!pendingDraftData) {
      toast.error("No draft data available. Please try again.");
      return;
    }

    if (isCashBank) {
      // User confirmed it's cash/bank - now show bank selection
      if (pendingDraftData.cashBankSelection) {
        // CRITICAL: Set flag to indicate we're transitioning to bank selection
        // This prevents onClose from clearing pendingDraftData
        isTransitioningToBankSelection.current = true;
        // Set bank selection FIRST, then close cash context dialog
        setCashBankSelection(pendingDraftData.cashBankSelection);
        // Now close cash context dialog - pendingDraftData will be preserved
        setCashContextConfirmation(null);
        // Reset flag after a brief delay to allow state updates
        setTimeout(() => {
          isTransitioningToBankSelection.current = false;
        }, 100);
      } else {
        // Close cash context dialog
        setCashContextConfirmation(null);
        // If no bank selection data, we need to trigger it
        // Re-parse with cash/bank context or show bank selection directly
        // For now, proceed to account confirmations if any
        if (pendingDraftData.originalAccountConfirmations && 
            Object.keys(pendingDraftData.originalAccountConfirmations).length > 0) {
          const firstKey = Object.keys(pendingDraftData.originalAccountConfirmations)[0];
          setAccountConfirmation({
            key: firstKey,
            data: pendingDraftData.originalAccountConfirmations[firstKey],
          });
        } else {
          // No confirmations needed, proceed with draft
          await createDraftWithAccounts(
            pendingDraftData.draft,
            pendingDraftData.contactId,
            pendingDraftData.rawPrompt,
            pendingDraftData.documentIds,
          );
          setPendingDraftData(null);
        }
      }
    } else {
      // User said it's NOT cash/bank - proceed without cash/bank selection
      // Close cash context dialog first
      setCashContextConfirmation(null);
      // Check if there are account confirmations needed
      if (pendingDraftData.originalAccountConfirmations && 
          Object.keys(pendingDraftData.originalAccountConfirmations).length > 0) {
        const firstKey = Object.keys(pendingDraftData.originalAccountConfirmations)[0];
        setAccountConfirmation({
          key: firstKey,
          data: pendingDraftData.originalAccountConfirmations[firstKey],
        });
      } else {
        // No confirmations needed, proceed with draft
        await createDraftWithAccounts(
          pendingDraftData.draft,
          pendingDraftData.contactId,
          pendingDraftData.rawPrompt,
          pendingDraftData.documentIds,
        );
        setPendingDraftData(null);
      }
    }
  };

  const handleCashBankSelection = async (accountId: string, accountName: string, accountKey: "debit_account" | "credit_account") => {
    if (!pendingDraftData) {
      toast.error("No draft data available. Please try again.");
      return;
    }

    // Update draft with selected cash/bank account (debit or credit)
    // Create a new draft object to ensure React state updates properly
    const existingAccounts = pendingDraftData.draft.accounts || {};
    const updatedDraft = {
      ...pendingDraftData.draft,
      accounts: {
        ...existingAccounts,
        [accountKey]: existingAccounts[accountKey] ? {
          ...existingAccounts[accountKey],
          existing_account_id: accountId,
        } : {
          suggested_name: accountName,
          suggested_type: "asset" as const,
          suggested_category: "current" as const,
          existing_account_id: accountId,
          confidence: 1.0,
        },
      },
    };

    // Update pending draft data with the updated draft
    const updatedPendingData = {
      ...pendingDraftData,
      draft: updatedDraft,
    };

    // Check if there are account confirmations needed (e.g., credit account)
    if (updatedPendingData.originalAccountConfirmations && 
        Object.keys(updatedPendingData.originalAccountConfirmations).length > 0) {
      // Close cash/bank selection dialog first
      setCashBankSelection(null);
      // Show first account confirmation
      const firstKey = Object.keys(updatedPendingData.originalAccountConfirmations)[0];
      setPendingDraftData(updatedPendingData);
      setAccountConfirmation({
        key: firstKey,
        data: updatedPendingData.originalAccountConfirmations[firstKey],
      });
    } else {
      // No other confirmations needed, proceed with draft creation
      // Close cash/bank selection dialog
      setCashBankSelection(null);
      
      try {
        await createDraftWithAccounts(
          updatedDraft,
          updatedPendingData.contactId,
          updatedPendingData.rawPrompt,
          updatedPendingData.documentIds,
        );
        setPendingDraftData(null);
        // Note: createDraftWithAccounts already calls setDraftId and onDraftCreated
        // which triggers the split view in PromptWorkspace
      } catch (error) {
        // Restore pending data so user can try again
        setPendingDraftData(updatedPendingData);
        toast.error("Failed to create draft", {
          description: error instanceof Error ? error.message : "Please try again.",
        });
        throw error; // Re-throw so dialog doesn't close
      }
    }
  };

  const handleAccountConfirmation = async (decision: {
    useExisting: boolean;
    accountId?: string;
    accountName?: string;
    accountType?: string;
  }) => {
    if (!pendingDraftData || !accountConfirmation) return;

    const { autoCreateAccountAction } = await import("@/lib/actions/accounts");
    let accountId: string | undefined = decision.accountId;

    // If creating new account, auto-create it
    if (!decision.useExisting && decision.accountName && decision.accountType) {
      try {
        // Get category from AI suggestion if available
        const accountSuggestion = accountConfirmation.data.suggested;
        const category = accountSuggestion.suggested_category ?? null;
        
        const createdAccount = await autoCreateAccountAction(
          decision.accountName,
          decision.accountType as "asset" | "liability" | "equity" | "revenue" | "expense",
          category as "current" | "non_current" | null,
        );
        accountId = createdAccount.id;
        toast.success(`Account "${decision.accountName}" created successfully`);
      } catch (error) {
        console.error("Failed to create account:", error);
        toast.error("Failed to create account", {
          description: error instanceof Error ? error.message : "Please try again.",
        });
        return;
      }
    }

    // Update draft data with confirmed account
    const accountKey = accountConfirmation.key;
    if (pendingDraftData.draft.accounts && pendingDraftData.draft.accounts[accountKey]) {
      // Store the confirmed account ID in the existing_account_id field
      pendingDraftData.draft.accounts[accountKey].existing_account_id = accountId ?? null;
    }

    // Store all account confirmations in pendingDraftData
    if (!pendingDraftData.accountConfirmations) {
      pendingDraftData.accountConfirmations = {};
    }
    pendingDraftData.accountConfirmations[accountKey] = {
      accountId: accountId ?? null,
      useExisting: decision.useExisting,
    };

    // Check if there are more accounts to confirm
    const allConfirmationKeys = Object.keys(pendingDraftData.originalAccountConfirmations || {});
    const confirmedKeys = Object.keys(pendingDraftData.accountConfirmations || {});
    const remainingKeys = allConfirmationKeys.filter((key) => !confirmedKeys.includes(key));

    if (remainingKeys.length > 0) {
      // Show next confirmation dialog
      const nextKey = remainingKeys[0];
      setAccountConfirmation({
        key: nextKey,
        data: pendingDraftData.originalAccountConfirmations[nextKey],
      });
    } else {
      // All accounts confirmed, update draft with confirmed account IDs and proceed
      Object.entries(pendingDraftData.accountConfirmations).forEach(([key, conf]: [string, any]) => {
        if (pendingDraftData.draft.accounts && pendingDraftData.draft.accounts[key]) {
          pendingDraftData.draft.accounts[key].existing_account_id = conf.accountId;
        }
      });

      setAccountConfirmation(null);
      await createDraftWithAccounts(
        pendingDraftData.draft,
        pendingDraftData.contactId,
        pendingDraftData.rawPrompt,
        pendingDraftData.documentIds,
      );
      setPendingDraftData(null);
    }
  };

  const createDraftWithAccounts = async (
    draftData: any,
    contactId: string | null,
    rawPrompt: string,
    fileIds: string[],
  ) => {
    try {
      const { saveDraftAction } = await import("@/lib/actions/drafts");
      const savedDraft = await saveDraftAction({
        ...draftData,
        rawPrompt,
        contactId,
      });

      if (savedDraft?.id) {
        setDraftId(savedDraft.id);
        setDocumentIds(fileIds);
        form.reset();
        setUploadedFiles([]);
        // Call onDraftCreated callback to trigger split view in parent component
        if (onDraftCreated) {
          onDraftCreated(savedDraft.id);
        }
        router.refresh();
        toast.success("Draft created successfully");
      } else {
        throw new Error("Draft was created but ID was not returned.");
      }
    } catch (saveError) {
      toast.error("Failed to save draft", {
        description: saveError instanceof Error ? saveError.message : "Please try again.",
      });
      throw saveError; // Re-throw to allow caller to handle
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tell us what happened</CardTitle>
        <CardDescription>
          You can type, upload documents, or do both.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Textarea
            rows={8}
            placeholder="Example: Received an invoice from ABC Suppliers for $500 for office supplies on January 15, 2025..."
            {...form.register("prompt")}
            disabled={isProcessing}
          />
          {form.formState.errors.prompt && (
            <p className="text-sm text-destructive">
              {form.formState.errors.prompt.message}
            </p>
          )}

          {/* File Upload Area */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/jpg"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                disabled={isProcessing}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Upload Documents
              </Button>
              {uploadedFiles.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {uploadedFiles.length} file{uploadedFiles.length > 1 ? "s" : ""} selected
                </span>
              )}
            </div>

            {/* Uploaded Files List */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2 border rounded-md p-3 bg-muted/50">
                {uploadedFiles.map((uploadedFile) => (
                  <div
                    key={uploadedFile.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{uploadedFile.file.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        ({(uploadedFile.file.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(uploadedFile.id)}
                      disabled={isProcessing}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" disabled={isProcessing} className="w-full">
            {isProcessing ? "Processing..." : "Generate Draft"}
          </Button>
        </form>

        {/* Cash Context Confirmation Dialog (STEP 1) */}
        {cashContextConfirmation && (
          <CashContextConfirmationDialog
            open={!!cashContextConfirmation}
            onClose={() => {
              // If we're transitioning to bank selection, don't clear pendingDraftData
              if (!isTransitioningToBankSelection.current && !cashBankSelection) {
                // User is cancelling (not transitioning) - clear everything
                setPendingDraftData(null);
              }
              setCashContextConfirmation(null);
            }}
            onConfirm={handleCashContextConfirmation}
            transactionDescription={cashContextConfirmation.transactionDescription}
          />
        )}

        {/* Cash/Bank Selection Dialog (STEP 2) */}
        {cashBankSelection && (
          <CashBankSelectionDialog
            open={!!cashBankSelection}
            onClose={() => {
              // User cancelled bank selection - clear everything
              setCashBankSelection(null);
              setPendingDraftData(null);
            }}
            onConfirm={handleCashBankSelection}
            cashAccount={cashBankSelection.cashAccount}
            bankAccounts={cashBankSelection.bankAccounts}
            accountKey={cashBankSelection.accountKey}
          />
        )}

        {/* Account Confirmation Dialog */}
        {accountConfirmation && (
          <AccountConfirmationDialog
            open={!!accountConfirmation}
            onClose={() => {
              setAccountConfirmation(null);
              setPendingDraftData(null);
            }}
            onConfirm={handleAccountConfirmation}
            accountKey={accountConfirmation.key}
            confirmationData={accountConfirmation.data}
          />
        )}
      </CardContent>
    </Card>
  );
}

