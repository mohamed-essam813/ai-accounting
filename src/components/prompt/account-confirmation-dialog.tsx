/**
 * Account Confirmation Dialog
 * Shows when AI suggests creating a new account but similar accounts exist
 * Allows user to choose: use existing account or create new one
 */

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import type { SimilarAccount } from "@/lib/accounting/find-similar-accounts";

type AccountSuggestion = {
  suggested_name: string;
  suggested_type: "asset" | "liability" | "equity" | "revenue" | "expense";
  suggested_category?: "current" | "non_current" | null;
  confidence: number;
  reasoning?: string;
};

type AccountConfirmationData = {
  suggested: AccountSuggestion;
  similar_accounts: SimilarAccount[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (decision: {
    useExisting: boolean;
    accountId?: string;
    accountName?: string;
    accountType?: string;
  }) => void;
  accountKey: string; // "debit_account", "credit_account", etc.
  confirmationData: AccountConfirmationData;
};

const accountTypeLabels: Record<string, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
};

export function AccountConfirmationDialog({
  open,
  onClose,
  onConfirm,
  accountKey,
  confirmationData,
}: Props) {
  const [selectedOption, setSelectedOption] = useState<"existing" | "new">(
    confirmationData.similar_accounts.length > 0 ? "existing" : "new"
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    confirmationData.similar_accounts[0]?.id ?? null,
  );

  const { suggested, similar_accounts } = confirmationData;
  const isLowConfidence = suggested.confidence < 0.8;

  const handleConfirm = () => {
    if (selectedOption === "existing" && selectedAccountId) {
      const selectedAccount = similar_accounts.find((acc) => acc.id === selectedAccountId);
      onConfirm({
        useExisting: true,
        accountId: selectedAccountId,
        accountName: selectedAccount?.name,
        accountType: selectedAccount?.type,
      });
    } else {
      onConfirm({
        useExisting: false,
        accountName: suggested.suggested_name,
        accountType: suggested.suggested_type,
      });
    }
    onClose();
  };

  const accountLabel = accountKey
    .replace("_account", "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirm Account Selection</DialogTitle>
          <DialogDescription>
            {similar_accounts.length > 0
              ? "AI suggested creating a new account, but similar accounts were found. Please choose an option."
              : "AI suggested creating a new account. Please confirm to proceed."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Suggested Account Info */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">AI Suggestion:</h4>
            <div className="border rounded-md p-3 bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium">{suggested.suggested_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline">{accountTypeLabels[suggested.suggested_type]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Confidence: {Math.round(suggested.confidence * 100)}%
                    </span>
                  </div>
                </div>
              </div>
              {suggested.reasoning && (
                <p className="text-xs text-muted-foreground mt-2">{suggested.reasoning}</p>
              )}
              {isLowConfidence && (
                <Alert className="mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Low confidence in account type. Please verify the type is correct.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          {/* Similar Accounts */}
          {similar_accounts.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Similar Existing Accounts:</h4>
            <div className="space-y-2">
              {similar_accounts.map((account) => (
                <div
                  key={account.id}
                  className={`border rounded-md p-3 cursor-pointer transition-colors ${
                    selectedOption === "existing" && selectedAccountId === account.id
                      ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => {
                    setSelectedOption("existing");
                    setSelectedAccountId(account.id);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <div
                        className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                          selectedOption === "existing" && selectedAccountId === account.id
                            ? "border-primary bg-primary"
                            : "border-muted-foreground"
                        }`}
                      >
                        {selectedOption === "existing" && selectedAccountId === account.id && (
                          <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{account.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {account.code}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {accountTypeLabels[account.type]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(account.similarity * 100)}% similar
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Create New Option */}
          <div className="space-y-2">
            <div
              className={`border rounded-md p-3 cursor-pointer transition-colors ${
                selectedOption === "new" ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2" : "hover:bg-muted/50"
              }`}
              onClick={() => setSelectedOption("new")}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <div
                    className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                      selectedOption === "new" ? "border-primary bg-primary" : "border-muted-foreground"
                    }`}
                  >
                    {selectedOption === "new" && (
                      <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="font-medium">Create New Account</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    "{suggested.suggested_name}" ({accountTypeLabels[suggested.suggested_type]})
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selectedOption === "existing" && !selectedAccountId}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

