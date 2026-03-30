/**
 * Unified Input Component
 * Feedback: Merge text input and file upload into one unified area
 * Business-oriented labeling: "Tell us what happened"
 */

"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Upload, X, FileText, Check, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { AccountConfirmationDialog } from "./account-confirmation-dialog";
import { CashBankSelectionDialog } from "./cash-bank-selection-dialog";
import { CashContextConfirmationDialog } from "./cash-context-confirmation-dialog";
import { PROMPT_SESSION_STORAGE_KEY } from "@/lib/constants";
import { getErrorMessage } from "@/lib/utils";
import { EVENT_QUICK_ACTIONS } from "@/lib/prompt/event-quick-actions";

/** Doc-only mode – prompt optional when documents are uploaded. */
const UnifiedInputSchema = z.object({
  prompt: z.string().optional(),
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingDraftData, setPendingDraftData] = useState<any>(null);
  const [needsClarification, setNeedsClarification] = useState<{
    message: string;
    options?: string[];
  } | null>(null);
  const [clarifyText, setClarifyText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  /** BRD-style intent hint after choosing a quick event chip */
  const [intentPreview, setIntentPreview] = useState<string | null>(null);
  const isTransitioningToBankSelection = useRef(false);

  const showParseError = (message: string) => {
    setParseError(message);
    toast.error(message);
  };

  /** Map API error code to user-facing message. */
  const parseErrorFromResponse = (data: { error?: string; code?: string }) => {
    const code = data.code as string | undefined;
    if (code === "VALIDATION_FAILED") return "Provide a prompt or upload at least one document.";
    if (code === "PARSE_FAILED") return "We couldn't read this document. Try a clearer file or different format.";
    if (code === "INTENT_REQUIRED") return "Please choose what you want to create (Invoice, Bill, Payment, or Journal).";
    return data.error ?? "Failed to process your request.";
  };

  // localStorage persistence state
  const STORAGE_KEY = "prompt_draft_session";
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("unsaved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(UnifiedInputSchema),
    defaultValues: {
      prompt: "",
    },
    mode: "onChange",
  });

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.prompt) {
          form.reset({ prompt: parsed.prompt });
          setSaveStatus("saved");
          if (parsed.savedAt) {
            setLastSavedAt(new Date(parsed.savedAt));
          }
        }
        // Note: We don't restore uploaded files as File objects can't be serialized
        // Users will need to re-upload files
      }
    } catch (error) {
      console.error("Failed to load saved prompt:", error);
    }
  }, [form]);

  // Auto-save to localStorage (debounced)
  const saveToLocalStorage = useCallback((promptText: string) => {
    if (typeof window === "undefined") return;
    
    setSaveStatus("saving");
    
    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    // Debounce save (2 seconds after last keystroke)
    autoSaveTimerRef.current = setTimeout(() => {
      try {
        const dataToSave = {
          prompt: promptText,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
        setSaveStatus("saved");
        setLastSavedAt(new Date());
      } catch (error) {
        console.error("Failed to save prompt to localStorage:", error);
        setSaveStatus("unsaved");
      }
    }, 2000);
  }, []);

  // Watch for prompt changes
  const promptValue = form.watch("prompt");
  useEffect(() => {
    if (promptValue) {
      setSaveStatus("unsaved");
      saveToLocalStorage(promptValue);
    } else {
      // Clear localStorage if prompt is empty
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
        setSaveStatus("unsaved");
        setLastSavedAt(null);
      }
    }
  }, [promptValue, saveToLocalStorage, form]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Clear localStorage after successful draft creation
  const clearSavedPrompt = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      setSaveStatus("unsaved");
      setLastSavedAt(null);
    }
  }, []);

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
    if (!(values.prompt?.trim() ?? "") && uploadedFiles.length === 0) {
      toast.error("Please describe what happened or upload a document.");
      return;
    }

    setParseError(null);
    startProcessing(async () => {
      try {
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
            }
          }
        }

        /** Doc-only – send raw prompt; server uses default when docs-only. */
        const rawPrompt = values.prompt?.trim() ?? "";
        const response = await fetch("/api/prompt/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: rawPrompt || undefined,
            documentIds: fileIds.length > 0 ? fileIds : undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          showParseError(parseErrorFromResponse(data));
          if (data.session_id && typeof window !== "undefined") {
            localStorage.setItem(PROMPT_SESSION_STORAGE_KEY, data.session_id);
          }
          return;
        }

        const sid = data.session_id as string;
        setSessionId(sid);
        if (typeof window !== "undefined") {
          localStorage.setItem(PROMPT_SESSION_STORAGE_KEY, sid);
        }

        if (data.draft_id) {
          handleDraftReady(data.draft_id, fileIds);
          return;
        }

        /** Clarify flow – low confidence. Show clarify UI, then retry with clarification. */
        if (data.needs_clarification) {
          setNeedsClarification(data.needs_clarification);
          setPendingDraftData({ documentIds: fileIds });
          setClarifyText("");
          setParseError(null);
          return;
        }

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
          
          setParseError(null);
          setCashContextConfirmation(data.cashContextConfirmation);
          return;
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
          
          setParseError(null);
          setCashBankSelection(data.cashBankSelection);
          return;
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
          
          setParseError(null);
          const firstKey = Object.keys(data.accountConfirmation)[0];
          setAccountConfirmation({
            key: firstKey,
            data: data.accountConfirmation[firstKey],
          });
          return;
        }

        setParseError(null);
        await createDraftWithAccounts(
          data.draft,
          data.contactId,
          values.prompt ?? "",
          fileIds
        );
      } catch (error) {
        console.error(error);
        showParseError(getErrorMessage(error, "Failed to process your request."));
      }
    });
  };

  /** Submit clarification and retry parse. */
  const handleClarifySubmit = async () => {
    const sid = sessionId ?? (typeof window !== "undefined" ? localStorage.getItem(PROMPT_SESSION_STORAGE_KEY) : null);
    const text = (clarifyText ?? "").trim();
    if (!sid || !text) {
      toast.error("Please clarify what this transaction is.");
      return;
    }
    setParseError(null);
    startProcessing(async () => {
      try {
        const res = await fetch(`/api/prompt/session/${sid}/retry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clarification: text }),
        });
        const data = await res.json();
        if (!res.ok) {
          showParseError(data.error ?? "Retry failed");
          return;
        }
        setSessionId(data.session_id ?? sid);
        if (data.draft_id) {
          setNeedsClarification(null);
          setClarifyText("");
          handleDraftReady(data.draft_id, (pendingDraftData?.documentIds as string[]) ?? []);
          return;
        }
        if (data.needs_clarification) {
          setNeedsClarification(data.needs_clarification);
          setClarifyText("");
          toast.info("Still unsure. Please add more detail.");
          return;
        }
        if (data.cashContextConfirmation?.required) {
          setNeedsClarification(null);
          setPendingDraftData({
            draft: data.draft,
            contactId: data.contactId,
            rawPrompt: "",
            documentIds: pendingDraftData?.documentIds ?? [],
            originalAccountConfirmations: data.accountConfirmation ?? {},
            accountConfirmations: {},
            cashBankSelection: data.cashBankSelection,
          });
          setCashContextConfirmation(data.cashContextConfirmation);
          return;
        }
        if (data.cashBankSelection) {
          setNeedsClarification(null);
          setPendingDraftData({
            draft: data.draft,
            contactId: data.contactId,
            rawPrompt: "",
            documentIds: pendingDraftData?.documentIds ?? [],
            originalAccountConfirmations: data.accountConfirmation ?? {},
            accountConfirmations: {},
          });
          setCashBankSelection(data.cashBankSelection);
          return;
        }
        if (data.accountConfirmation && Object.keys(data.accountConfirmation).length > 0) {
          setNeedsClarification(null);
          setPendingDraftData({
            draft: data.draft,
            contactId: data.contactId,
            rawPrompt: "",
            documentIds: pendingDraftData?.documentIds ?? [],
            originalAccountConfirmations: data.accountConfirmation,
            accountConfirmation: {},
          });
          const firstKey = Object.keys(data.accountConfirmation)[0];
          setAccountConfirmation({ key: firstKey, data: data.accountConfirmation[firstKey] });
          return;
        }
        setNeedsClarification(null);
        setClarifyText("");
        await createDraftWithAccounts(
          data.draft,
          data.contactId,
          "",
          (pendingDraftData?.documentIds as string[]) ?? []
        );
      } catch (e) {
        showParseError(getErrorMessage(e, "Failed to submit clarification."));
      }
    });
  };

  const handleRetry = async () => {
    setParseError(null);
    const sid = sessionId ?? (typeof window !== "undefined" ? localStorage.getItem(PROMPT_SESSION_STORAGE_KEY) : null);
    if (sid) {
      startProcessing(async () => {
        try {
          const res = await fetch(`/api/prompt/session/${sid}/retry`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) {
            showParseError(data.error ?? "Retry failed");
            return;
          }
          setSessionId(data.session_id);
          if (data.draft_id) {
            handleDraftReady(data.draft_id, (pendingDraftData?.documentIds as string[]) ?? []);
            return;
          }
          if (data.needs_clarification) {
            setNeedsClarification(data.needs_clarification);
            setClarifyText("");
            return;
          }
          if (data.cashContextConfirmation?.required) {
            setPendingDraftData({
              draft: data.draft,
              contactId: data.contactId,
              rawPrompt: "",
              documentIds: [],
              originalAccountConfirmations: data.accountConfirmation ?? {},
              accountConfirmations: {},
              cashBankSelection: data.cashBankSelection,
            });
            setCashContextConfirmation(data.cashContextConfirmation);
            return;
          }
          if (data.cashBankSelection) {
            setPendingDraftData({
              draft: data.draft,
              contactId: data.contactId,
              rawPrompt: "",
              documentIds: [],
              originalAccountConfirmations: data.accountConfirmation ?? {},
              accountConfirmations: {},
            });
            setCashBankSelection(data.cashBankSelection);
            return;
          }
          if (data.accountConfirmation && Object.keys(data.accountConfirmation).length > 0) {
            setPendingDraftData({
              draft: data.draft,
              contactId: data.contactId,
              rawPrompt: "",
              documentIds: [],
              originalAccountConfirmations: data.accountConfirmation,
              accountConfirmations: {},
            });
            const firstKey = Object.keys(data.accountConfirmation)[0];
            setAccountConfirmation({ key: firstKey, data: data.accountConfirmation[firstKey] });
          }
        } catch (e) {
          showParseError(getErrorMessage(e, "Retry failed"));
        }
      });
      return;
    }
    form.handleSubmit(onSubmit)();
  };

  const handleDraftUpdated = () => {
    router.refresh();
  };

  const handleDraftReady = (draftId: string, fileIds: string[]) => {
    setParseError(null);
    setSessionId(null);
    setDraftId(draftId);
    setDocumentIds(fileIds);
    form.reset();
    setUploadedFiles([]);
    clearSavedPrompt();
    setPendingDraftData(null);
    setNeedsClarification(null);
    setClarifyText("");
    setIntentPreview(null);
    setCashContextConfirmation(null);
    setCashBankSelection(null);
    setAccountConfirmation(null);
    if (onDraftCreated) onDraftCreated(draftId);
    router.refresh();
    toast.success("Draft created successfully");
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

    if (sessionId) {
      try {
        setParseError(null);
        const res = await fetch(`/api/prompt/session/${sessionId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: { type: "cash_context", isCashBank } }),
        });
        const data = await res.json();
        if (!res.ok) {
          showParseError(data.error ?? "Failed to submit answer");
          return;
        }
        if (data.draft_id) {
          handleDraftReady(data.draft_id, pendingDraftData.documentIds ?? []);
          setCashContextConfirmation(null);
          return;
        }
        if (data.cashBankSelection) {
          isTransitioningToBankSelection.current = true;
          setCashBankSelection(data.cashBankSelection);
          setCashContextConfirmation(null);
          setPendingDraftData((p: any) => (p ? { ...p, draft: data.draft, contactId: data.contactId } : p));
          setTimeout(() => { isTransitioningToBankSelection.current = false; }, 100);
          return;
        }
        if (data.accountConfirmation && Object.keys(data.accountConfirmation).length > 0) {
          setCashContextConfirmation(null);
          const firstKey = Object.keys(data.accountConfirmation)[0];
          setAccountConfirmation({ key: firstKey, data: data.accountConfirmation[firstKey] });
          setPendingDraftData((p: any) => (p ? { ...p, draft: data.draft, contactId: data.contactId } : p));
          return;
        }
      } catch (e) {
        showParseError(getErrorMessage(e, "Failed to submit answer"));
      }
      return;
    }

    if (isCashBank) {
      if (pendingDraftData.cashBankSelection) {
        isTransitioningToBankSelection.current = true;
        setCashBankSelection(pendingDraftData.cashBankSelection);
        setCashContextConfirmation(null);
        setTimeout(() => { isTransitioningToBankSelection.current = false; }, 100);
      } else {
        setCashContextConfirmation(null);
        if (pendingDraftData.originalAccountConfirmations && Object.keys(pendingDraftData.originalAccountConfirmations).length > 0) {
          const firstKey = Object.keys(pendingDraftData.originalAccountConfirmations)[0];
          setAccountConfirmation({ key: firstKey, data: pendingDraftData.originalAccountConfirmations[firstKey] });
        } else {
          await createDraftWithAccounts(
            pendingDraftData.draft,
            pendingDraftData.contactId,
            pendingDraftData.rawPrompt,
            pendingDraftData.documentIds ?? [],
          );
          setPendingDraftData(null);
        }
      }
    } else {
      setCashContextConfirmation(null);
      if (pendingDraftData.originalAccountConfirmations && Object.keys(pendingDraftData.originalAccountConfirmations).length > 0) {
        const firstKey = Object.keys(pendingDraftData.originalAccountConfirmations)[0];
        setAccountConfirmation({ key: firstKey, data: pendingDraftData.originalAccountConfirmations[firstKey] });
      } else {
        await createDraftWithAccounts(
          pendingDraftData.draft,
          pendingDraftData.contactId,
          pendingDraftData.rawPrompt,
          pendingDraftData.documentIds ?? [],
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

    if (sessionId) {
      try {
        setParseError(null);
        const res = await fetch(`/api/prompt/session/${sessionId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answer: { type: "cash_bank_selection", accountId, accountKey },
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showParseError(data.error ?? "Failed to submit answer");
          return;
        }
        if (data.draft_id) {
          handleDraftReady(data.draft_id, pendingDraftData.documentIds ?? []);
          setCashBankSelection(null);
          return;
        }
        if (data.accountConfirmation && Object.keys(data.accountConfirmation).length > 0) {
          setCashBankSelection(null);
          const firstKey = Object.keys(data.accountConfirmation)[0];
          setAccountConfirmation({ key: firstKey, data: data.accountConfirmation[firstKey] });
          setPendingDraftData((p: any) => (p ? { ...p, draft: data.draft, contactId: data.contactId } : p));
          return;
        }
      } catch (e) {
        showParseError(getErrorMessage(e, "Failed to submit answer"));
      }
      return;
    }

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
    const updatedPendingData = { ...pendingDraftData, draft: updatedDraft };

    if (updatedPendingData.originalAccountConfirmations && Object.keys(updatedPendingData.originalAccountConfirmations).length > 0) {
      setCashBankSelection(null);
      const firstKey = Object.keys(updatedPendingData.originalAccountConfirmations)[0];
      setPendingDraftData(updatedPendingData);
      setAccountConfirmation({ key: firstKey, data: updatedPendingData.originalAccountConfirmations[firstKey] });
    } else {
      setCashBankSelection(null);
      try {
        await createDraftWithAccounts(
          updatedDraft,
          updatedPendingData.contactId,
          updatedPendingData.rawPrompt,
          updatedPendingData.documentIds ?? [],
        );
        setPendingDraftData(null);
      } catch (error) {
        setPendingDraftData(updatedPendingData);
        toast.error("Failed to create draft", { description: getErrorMessage(error, "Please try again.") });
        throw error;
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

    if (sessionId) {
      try {
        setParseError(null);
        const res = await fetch(`/api/prompt/session/${sessionId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answer: {
              type: "account_confirmation",
              key: accountConfirmation.key,
              decision: {
                useExisting: decision.useExisting,
                accountId: decision.accountId,
                accountName: decision.accountName,
                accountType: decision.accountType,
              },
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showParseError(data.error ?? "Failed to submit answer");
          return;
        }
        if (data.draft_id) {
          handleDraftReady(data.draft_id, pendingDraftData.documentIds ?? []);
          setAccountConfirmation(null);
          setPendingDraftData(null);
          return;
        }
        if (data.accountConfirmation && Object.keys(data.accountConfirmation).length > 0) {
          const firstKey = Object.keys(data.accountConfirmation)[0];
          setAccountConfirmation({ key: firstKey, data: data.accountConfirmation[firstKey] });
          setPendingDraftData((p: any) => (p ? { ...p, draft: data.draft, contactId: data.contactId } : p));
          return;
        }
      } catch (e) {
        showParseError(getErrorMessage(e, "Failed to submit answer"));
      }
      return;
    }

    const { autoCreateAccountAction } = await import("@/lib/actions/accounts");
    let accountId: string | undefined = decision.accountId;

    // If creating new account, auto-create it
    if (!decision.useExisting && decision.accountName && decision.accountType) {
      try {
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
          description: getErrorMessage(error, "Please try again."),
        });
        return;
      }
    }

    const accountKey = accountConfirmation.key;
    const accountConfirmations = {
      ...(pendingDraftData.accountConfirmations || {}),
      [accountKey]: { accountId: accountId ?? null, useExisting: decision.useExisting },
    };

    const updatedDraft = { ...pendingDraftData.draft };
    if (updatedDraft.accounts && updatedDraft.accounts[accountKey]) {
      updatedDraft.accounts = {
        ...updatedDraft.accounts,
        [accountKey]: {
          ...updatedDraft.accounts[accountKey],
          existing_account_id: accountId ?? null,
        },
      };
    }

    const updatedPending = {
      ...pendingDraftData,
      draft: updatedDraft,
      accountConfirmations,
    };
    setPendingDraftData(updatedPending);

    const allConfirmationKeys = Object.keys(pendingDraftData.originalAccountConfirmations || {});
    const confirmedKeys = Object.keys(accountConfirmations);
    const remainingKeys = allConfirmationKeys.filter((k) => !confirmedKeys.includes(k));

    if (remainingKeys.length > 0) {
      const nextKey = remainingKeys[0];
      setAccountConfirmation({
        key: nextKey,
        data: updatedPending.originalAccountConfirmations![nextKey],
      });
      return;
    }

    // All confirmed: build final draft with all account IDs and create
    const finalDraft = { ...updatedPending.draft };
    if (finalDraft.accounts) {
      const accounts = { ...finalDraft.accounts };
      Object.entries(accountConfirmations).forEach(([k, conf]) => {
        const { accountId: aid } = conf as { accountId: string | null; useExisting: boolean };
        if (accounts[k]) {
          accounts[k] = { ...accounts[k], existing_account_id: aid };
        }
      });
      finalDraft.accounts = accounts;
    }

    try {
      await createDraftWithAccounts(
        finalDraft,
        updatedPending.contactId,
        updatedPending.rawPrompt,
        updatedPending.documentIds ?? [],
      );
      setAccountConfirmation(null);
      setPendingDraftData(null);
    } catch (err) {
      toast.error("Failed to create draft", {
        description: getErrorMessage(err, "Please try again."),
      });
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
        // Clear saved prompt from localStorage after successful draft creation
        clearSavedPrompt();
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
        description: getErrorMessage(saveError, "Please try again."),
      });
      throw saveError; // Re-throw to allow caller to handle
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tell us what happened</CardTitle>
            <CardDescription>
              Describe what happened, upload documents only, or both.
            </CardDescription>
          </div>
          {/* Save Status Indicator */}
          {promptValue && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {saveStatus === "saving" && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Saving...</span>
                </>
              )}
              {saveStatus === "saved" && lastSavedAt && (
                <>
                  <Check className="h-3 w-3 text-green-600" />
                  <span>
                    Saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {needsClarification ? (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="space-y-3">
                <p>{needsClarification.message}</p>
                {needsClarification.options && needsClarification.options.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {needsClarification.options.map((opt) => (
                      <Button
                        key={opt}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setClarifyText(opt)}
                      >
                        {opt}
                      </Button>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <label className="text-sm font-medium">Clarify (or use a quick option above)</label>
              <Textarea
                rows={4}
                placeholder="e.g. It's an invoice from ABC for office supplies."
                value={clarifyText}
                onChange={(e) => setClarifyText(e.target.value)}
                disabled={isProcessing}
              />
            </div>
            {parseError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNeedsClarification(null);
                  setClarifyText("");
                  setParseError(null);
                }}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isProcessing || !clarifyText.trim()}
                onClick={handleClarifySubmit}
              >
                {isProcessing ? "Submitting…" : "Submit clarification"}
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Quick events (BRD)</p>
            <div className="flex flex-wrap gap-2">
              {EVENT_QUICK_ACTIONS.map((action) => (
                <Button
                  key={action.id}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={isProcessing}
                  onClick={() => {
                    form.setValue("prompt", action.template, { shouldDirty: true });
                    setIntentPreview(action.preview);
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </div>
            {intentPreview ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed border-muted-foreground/25 bg-muted/30 px-3 py-2">
                Intent preview: {intentPreview}
              </p>
            ) : null}
          </div>
          <Textarea
            rows={8}
            placeholder="Example: Received an invoice from ABC Suppliers for $500 for office supplies on January 15, 2025. Or leave empty and upload documents only."
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
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{uploadedFile.file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
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

          {parseError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <AlertDescription className="flex flex-col gap-2">
                <span>{parseError}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  disabled={isProcessing}
                  className="w-fit border-destructive/50 text-destructive hover:bg-destructive/10"
                >
                  <RotateCcw className="h-3 w-3 mr-2" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </form>
        )}

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
            key={accountConfirmation.key}
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

