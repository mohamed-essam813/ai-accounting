/**
 * Cash/Bank Selection Dialog
 * Shows when recording a payment/receipt and the payment method (cash or bank) is ambiguous
 * Allows user to choose: Cash or a specific Bank account
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type BankAccount = {
  id: string;
  name: string;
  code: string;
};

type CashAccount = {
  id: string;
  name: string;
  code: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (accountId: string, accountName: string, accountKey: "debit_account" | "credit_account") => void;
  cashAccount: CashAccount | null;
  bankAccounts: BankAccount[];
  accountKey: "debit_account" | "credit_account";
};

export function CashBankSelectionDialog({
  open,
  onClose,
  onConfirm,
  cashAccount,
  bankAccounts,
  accountKey,
}: Props) {
  // Create options array: Cash first, then banks
  const options: Array<{ id: string; name: string; code: string; type: "cash" | "bank" }> = [];
  if (cashAccount) {
    options.push({ ...cashAccount, type: "cash" });
  }
  options.push(...bankAccounts.map(b => ({ ...b, type: "bank" as const })));

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    options.length > 0 ? options[0].id : null
  );

  const handleConfirm = async () => {
    if (!selectedAccountId) return;
    
    const selectedOption = options.find(opt => opt.id === selectedAccountId);
    if (selectedOption) {
      // Call onConfirm and wait for it to complete before closing
      // This ensures the draft creation process completes
      try {
        await onConfirm(selectedOption.id, selectedOption.name, accountKey);
      } catch (error) {
        console.error("Error in cash/bank selection confirmation:", error);
        // Don't close dialog if there's an error - let user try again
        return;
      }
    }
    onClose();
  };

  const hasAnyOptions = options.length > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {accountKey === "debit_account" ? "Select Cash/Bank Account" : "Select Cash/Bank Account (Credit)"}
          </DialogTitle>
          <DialogDescription>
            {accountKey === "debit_account" 
              ? "Please select whether this transaction is through Cash or a Bank account."
              : "Please select the Cash or Bank account for this transaction."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {hasAnyOptions ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="account-select" className="text-sm font-medium">
                  Select Account
                </Label>
                <Select value={selectedAccountId || undefined} onValueChange={setSelectedAccountId}>
                  <SelectTrigger id="account-select" className="w-full h-11">
                    <SelectValue placeholder="Select Cash or Bank account">
                      {selectedAccountId && (() => {
                        const selected = options.find(opt => opt.id === selectedAccountId);
                        return selected ? (
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{selected.name}</span>
                              <span className="text-xs text-muted-foreground">({selected.code})</span>
                            </div>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {selected.type === "cash" ? "Cash" : "Bank"}
                            </span>
                          </div>
                        ) : null;
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.id} value={option.id} className="py-2.5">
                        <div className="flex items-center justify-between w-full gap-4">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-medium truncate">{option.name}</span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              Code: {option.code}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                            {option.type === "cash" ? "Cash" : "Bank"}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                {options.length} account{options.length !== 1 ? "s" : ""} available
              </p>
            </div>
          ) : (
            <div className="p-4 border rounded-md bg-muted/50">
              <p className="text-sm text-muted-foreground">
                No Cash or Bank accounts found. Please create a Cash account (code 1000) or Bank account (codes 1010-1099) first.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!selectedAccountId || !hasAnyOptions}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

