import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolvePromptWithAccountCreation } from "@/lib/ai/prompt-pipeline";
import { DraftSchema, type DraftPayload } from "@/lib/ai/schema";
import { getCurrentUser } from "@/lib/data/users";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/database.types";
import type { Account } from "@/lib/accounting";

const requestSchema = z.object({
  prompt: z.string().min(1, "Please describe what happened."),
  documentIds: z.array(z.string()).optional(),
});

type SourceDocumentRow = Database["public"]["Tables"]["source_documents"]["Row"];

async function getDocumentTexts(documentIds: string[], tenantId: string): Promise<string> {
  if (documentIds.length === 0) return "";

  const supabase = createServiceSupabaseClient();
  const table = supabase.from("source_documents") as unknown as {
    select: (columns: string) => {
      in: (column: string, values: string[]) => {
        eq: (column: string, value: string) => Promise<{
          data: SourceDocumentRow[] | null;
          error: unknown;
        }>;
      };
    };
  };

  const { data: documents, error } = await table
    .select("vision_text, file_name")
    .in("id", documentIds)
    .eq("tenant_id", tenantId);

  if (error || !documents || documents.length === 0) {
    return "";
  }

  // Combine all document texts into context
  const documentContexts = documents
    .filter((doc) => doc.vision_text)
    .map((doc, idx) => {
      const fileName = doc.file_name || `Document ${idx + 1}`;
      return `\n\nDocument: ${fileName}\n${doc.vision_text}`;
    })
    .join("\n\n---\n");

  return documentContexts;
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { prompt, documentIds } = requestSchema.parse(json);

    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch document texts if provided (silently, no OCR terminology)
    let documentContext = "";
    if (documentIds && documentIds.length > 0) {
      documentContext = await getDocumentTexts(documentIds, user.tenant.id);
    }

    // Combine prompt with document context
    const combinedPrompt = documentContext
      ? `${prompt}\n\nAdditional context from uploaded documents:${documentContext}`
      : prompt;

    // Use stateful prompt pipeline that auto-creates missing accounts
    // This fixes the bug where prompt execution stops after account creation confirmation
    const parsed = await resolvePromptWithAccountCreation(combinedPrompt, {
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

    // Search for or create contact if counterparty is provided
    let contactId: string | null = null;
    if (validation.data.entities.counterparty) {
      try {
        const { findOrCreateContactAction } = await import("@/lib/actions/contacts");
        
        // Determine contact type from intent
        let contactType: "customer" | "vendor" = "customer";
        const promptLower = combinedPrompt.toLowerCase();
        if (
          validation.data.intent === "create_bill" ||
          validation.data.intent === "create_debit_note" ||
          (validation.data.intent === "record_payment" && 
           (promptLower.includes("supplier") ||
            promptLower.includes("vendor") ||
            promptLower.includes("payable") ||
            promptLower.includes("pay bill")))
        ) {
          contactType = "vendor";
        }

        const contact = await findOrCreateContactAction(
          validation.data.entities.counterparty,
          contactType
        );
        contactId = contact.id;
      } catch (error) {
        console.error("Failed to find or create contact:", error);
        // Continue without contact - draft will still be created
      }
    }

    // STEP 1: Detect if transaction might involve cash/bank (MANDATORY CHECK)
    // This is more aggressive - we check for ANY potential cash/bank involvement
    const promptLower = prompt.toLowerCase();
    const cashBankKeywords = [
      "loan", "borrow", "dividend", "capital", "drawing", "draw", "bank charge", "bank fee",
      "transfer", "payment", "receipt", "deposit", "withdrawal", "cash", "bank",
      "interest received", "interest paid", "repayment", "injection", "contribution"
    ];
    const hasCashBankKeywords = cashBankKeywords.some(keyword => promptLower.includes(keyword));
    
    // Check if intent typically involves cash/bank
    const cashBankIntents: Array<typeof validation.data.intent> = [
      "record_payment",
      "reconcile_bank",
    ];
    const isCashBankIntent = cashBankIntents.includes(validation.data.intent);
    
    // Check if accounts suggest cash/bank (asset/current type)
    const hasCashBankAccounts = validation.data.accounts && (
      (validation.data.accounts.debit_account?.suggested_type === "asset" && 
       validation.data.accounts.debit_account?.suggested_category === "current") ||
      (validation.data.accounts.credit_account?.suggested_type === "asset" && 
       validation.data.accounts.credit_account?.suggested_category === "current")
    );
    
    // If ANY indicator suggests cash/bank, require confirmation
    const requiresCashContextConfirmation = hasCashBankKeywords || isCashBankIntent || hasCashBankAccounts;
    
    // STEP 2: If cash context is required, prepare bank selection data
    // This will be shown AFTER user confirms cash context (STEP 1)
    // Special handling for intents that involve cash/bank: Check if cash/bank selection is needed
    // This applies to: record_payment, reconcile_bank, and any other intent where cash/bank could be involved
    let cashBankSelection: {
      bankAccounts: Array<{ id: string; name: string; code: string }>;
      cashAccount: { id: string; name: string; code: string } | null;
      accountKey: "debit_account" | "credit_account"; // Which account needs selection
    } | undefined = undefined;
    
    // If cash context confirmation is required, prepare bank selection data
    // (It will be shown after user confirms in STEP 1)
    if (requiresCashContextConfirmation && validation.data.accounts) {
      // Determine which account needs selection (debit or credit)
      let accountKeyToSelect: "debit_account" | "credit_account" = "debit_account";
      
      // For reconcile_bank, debit is typically cash/bank
      // For record_payment, debit is typically cash/bank
      if (validation.data.accounts.debit_account?.suggested_type === "asset" && 
          validation.data.accounts.debit_account?.suggested_category === "current") {
        accountKeyToSelect = "debit_account";
      } else if (validation.data.accounts.credit_account?.suggested_type === "asset" && 
                 validation.data.accounts.credit_account?.suggested_category === "current") {
        accountKeyToSelect = "credit_account";
      }
      
      // Load bank accounts to prepare selection data
      const { listAccounts } = await import("@/lib/data/accounts");
      const { filterBankAccounts } = await import("@/lib/accounting/is-bank-account");
      const allAccountsList = await listAccounts();
      const bankAccountsList = filterBankAccounts(allAccountsList);
      
      // Find Cash account (code 1000)
      const cashAccountFound = allAccountsList.find((acc: Account) => acc.code === "1000" && acc.type === "asset");
      
      // Filter out Cash from bank accounts (we'll show it separately)
      const bankAccountsExcludingCash = bankAccountsList.filter((acc: Account) => acc.code !== "1000");
      
      cashBankSelection = {
        bankAccounts: bankAccountsExcludingCash.map((acc: Account) => ({
          id: acc.id,
          name: acc.name,
          code: acc.code,
        })),
        cashAccount: cashAccountFound ? {
          id: cashAccountFound.id,
          name: cashAccountFound.name,
          code: cashAccountFound.code,
        } : null,
        accountKey: accountKeyToSelect,
      };
    }
    
    // Legacy check for direct bank selection (when cash context not required but bank selection needed)
    // This handles cases where bank selection is needed but cash context confirmation was skipped
    if (!requiresCashContextConfirmation && cashBankIntents.includes(validation.data.intent) && validation.data.accounts) {
      // For record_payment and reconcile_bank, debit_account is typically cash/bank
      // But we should also check credit_account for reconcile_bank (e.g., paying interest/fees)
      type AccountsType = NonNullable<DraftPayload["accounts"]>;
      type AccountSuggestion = AccountsType["debit_account"] | AccountsType["credit_account"];
      const accountsToCheck: Array<{ key: "debit_account" | "credit_account"; account: AccountSuggestion }> = [];
      
      if (validation.data.accounts.debit_account) {
        accountsToCheck.push({ key: "debit_account", account: validation.data.accounts.debit_account });
      }
      
      // For reconcile_bank, credit_account could also be cash/bank (e.g., bank transfer, paying from bank)
      if (validation.data.intent === "reconcile_bank" && validation.data.accounts.credit_account) {
        const creditAccount = validation.data.accounts.credit_account;
        // Only check if credit account is asset type (could be cash/bank)
        if (creditAccount.suggested_type === "asset" && creditAccount.suggested_category === "current") {
          accountsToCheck.push({ key: "credit_account", account: creditAccount });
        }
      }
      
      // Check each account to see if cash/bank selection is needed
      // Load accounts once outside the loop to avoid redeclaration
      let accountsLoaded = false;
      let allAccountsList: Account[] = [];
      let bankAccountsList: Account[] = [];
      let cashAccountFound: Account | null = null;
      let bankAccountsExcludingCashList: Account[] = [];
      
      for (const { key, account } of accountsToCheck) {
        const isAssetType = account.suggested_type === "asset";
        const isNotExplicitlySet = !account.existing_account_id;
        const isCurrentAsset = account.suggested_category === "current" && isAssetType;
        
        // For reconcile_bank intent, if debit_account is asset/current and not explicitly set, always trigger selection
        // This ensures loans, dividends, etc. always ask for cash/bank selection
        const isReconcileBankDebit = validation.data.intent === "reconcile_bank" && key === "debit_account";
        
        // Check if it's cash/bank-like (name contains cash/bank, or it's a current asset)
        const isCashOrBankLike = 
          account.suggested_name?.toLowerCase().includes("cash") ||
          account.suggested_name?.toLowerCase().includes("bank") ||
          isCurrentAsset;
        
        // Trigger selection if:
        // 1. It's a reconcile_bank debit_account (loans, dividends, etc.) - always ask if not explicitly set
        // 2. OR it's any cash/bank-like account that's not explicitly set
        const shouldTriggerSelection = isAssetType && isNotExplicitlySet && (
          isReconcileBankDebit || isCashOrBankLike
        );
        
        if (shouldTriggerSelection) {
          // Load accounts only once
          if (!accountsLoaded) {
            const { listAccounts } = await import("@/lib/data/accounts");
            const { filterBankAccounts } = await import("@/lib/accounting/is-bank-account");
            allAccountsList = await listAccounts();
            bankAccountsList = filterBankAccounts(allAccountsList);
            
            // Find Cash account (code 1000)
            cashAccountFound = allAccountsList.find((acc: Account) => acc.code === "1000" && acc.type === "asset") || null;
            
            // Filter out Cash from bank accounts (we'll show it separately)
            bankAccountsExcludingCashList = bankAccountsList.filter((acc: Account) => acc.code !== "1000");
            accountsLoaded = true;
          }
          
          cashBankSelection = {
            bankAccounts: bankAccountsExcludingCashList.map((acc: Account) => ({
              id: acc.id,
              name: acc.name,
              code: acc.code,
            })),
            cashAccount: cashAccountFound ? {
              id: cashAccountFound.id,
              name: cashAccountFound.name,
              code: cashAccountFound.code,
            } : null,
            accountKey: key,
          };
          
          break; // Only show one cash/bank selection dialog at a time
        }
      }
    }
    
    // Check for account confirmation if AI suggested new accounts
    // ALWAYS show confirmation dialog if account doesn't exist (even if no similar accounts found)
    // This ensures user can review before creating new accounts
    type AccountsType = NonNullable<DraftPayload["accounts"]>;
    type AccountConfirmationValue = {
      suggested: AccountsType["debit_account"] | AccountsType["credit_account"] | AccountsType["tax_debit_account"] | AccountsType["tax_credit_account"];
      similar_accounts: Array<{ id: string; name: string; code: string }>;
    };
    const accountConfirmation: Partial<Record<"debit_account" | "credit_account" | "tax_debit_account" | "tax_credit_account", AccountConfirmationValue>> = {};
    if (validation.data.accounts) {
      const { findSimilarAccounts } = await import("@/lib/accounting/find-similar-accounts");
      
      // Skip account confirmation if cash/bank selection is needed (we'll handle it separately)
      const skipDebitConfirmation = cashBankSelection && cashBankSelection.accountKey === "debit_account";
      const skipCreditConfirmation = cashBankSelection && cashBankSelection.accountKey === "credit_account";
      
      if (!skipDebitConfirmation) {
        // Check debit account - show confirmation if account doesn't exist
        if (validation.data.accounts.debit_account && !validation.data.accounts.debit_account.existing_account_id) {
        const similar = await findSimilarAccounts(
          validation.data.accounts.debit_account.suggested_name,
          validation.data.accounts.debit_account.suggested_type,
          user.tenant.id,
        );
        // Always show confirmation dialog if account doesn't exist (even if no similar accounts)
        accountConfirmation.debit_account = {
          suggested: validation.data.accounts.debit_account,
          similar_accounts: similar, // Can be empty array
        };
        }
      }

      // Check credit account - show confirmation if account doesn't exist
      if (!skipCreditConfirmation && validation.data.accounts.credit_account && !validation.data.accounts.credit_account.existing_account_id) {
        const similar = await findSimilarAccounts(
          validation.data.accounts.credit_account.suggested_name,
          validation.data.accounts.credit_account.suggested_type,
          user.tenant.id,
        );
        accountConfirmation.credit_account = {
          suggested: validation.data.accounts.credit_account,
          similar_accounts: similar, // Can be empty array
        };
      }

      // Check tax debit account - show confirmation if account doesn't exist
      if (validation.data.accounts.tax_debit_account && !validation.data.accounts.tax_debit_account.existing_account_id) {
        const similar = await findSimilarAccounts(
          validation.data.accounts.tax_debit_account.suggested_name,
          validation.data.accounts.tax_debit_account.suggested_type,
          user.tenant.id,
        );
        accountConfirmation.tax_debit_account = {
          suggested: validation.data.accounts.tax_debit_account,
          similar_accounts: similar, // Can be empty array
        };
      }

      // Check tax credit account - show confirmation if account doesn't exist
      if (validation.data.accounts.tax_credit_account && !validation.data.accounts.tax_credit_account.existing_account_id) {
        const similar = await findSimilarAccounts(
          validation.data.accounts.tax_credit_account.suggested_name,
          validation.data.accounts.tax_credit_account.suggested_type,
          user.tenant.id,
        );
        accountConfirmation.tax_credit_account = {
          suggested: validation.data.accounts.tax_credit_account,
          similar_accounts: similar, // Can be empty array
        };
      }
    }

    return NextResponse.json({ 
      draft: validation.data,
      contactId: contactId,
      accountConfirmation: Object.keys(accountConfirmation).length > 0 ? accountConfirmation : undefined,
      cashContextConfirmation: requiresCashContextConfirmation ? {
        required: true,
        transactionDescription: prompt,
      } : undefined,
      cashBankSelection: cashBankSelection,
    });
  } catch (error) {
    console.error("Prompt parsing failed", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof Error) {
      // Return the actual error message and include more details for debugging
      const errorDetails = {
        message: error.message || "Failed to parse prompt",
        name: error.name,
        // Include stack trace in development only
        ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
      };
      
      console.error("Returning error to client:", errorDetails);
      
      return NextResponse.json(
        { error: errorDetails.message, details: errorDetails },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "Failed to parse prompt", details: "Unknown error occurred" },
      { status: 500 },
    );
  }
}

