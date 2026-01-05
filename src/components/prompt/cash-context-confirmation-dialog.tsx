/**
 * Cash Context Confirmation Dialog
 * Step 1: Ask user if the transaction is related to cash or bank
 * This is MANDATORY for all potential cash/bank transactions
 */

"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (isCashBank: boolean) => void;
  transactionDescription?: string;
};

export function CashContextConfirmationDialog({
  open,
  onClose,
  onConfirm,
  transactionDescription,
}: Props) {
  const handleYes = async () => {
    try {
      await onConfirm(true);
      onClose();
    } catch (error) {
      console.error("Error in cash context confirmation:", error);
      // Don't close if there's an error
    }
  };

  const handleNo = async () => {
    try {
      await onConfirm(false);
      onClose();
    } catch (error) {
      console.error("Error in cash context confirmation:", error);
      // Don't close if there's an error
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cash / Bank Transaction Confirmation</DialogTitle>
          <DialogDescription>
            {transactionDescription 
              ? `Is this transaction related to cash or bank?`
              : "Is this transaction related to cash or bank?"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-4">
            This transaction may involve cash or bank accounts. Please confirm if it should be recorded against a cash or bank account.
          </p>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Examples of cash/bank transactions:</p>
            <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1 ml-2">
              <li>Loans (drawdown, repayment, interest)</li>
              <li>Dividends (paid / received)</li>
              <li>Capital injections</li>
              <li>Owner drawings</li>
              <li>Bank charges</li>
              <li>Inter-bank transfers</li>
              <li>Bank receipts & payments</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={handleNo}
            className="w-full sm:w-auto"
          >
            No - Non-cash Transaction
          </Button>
          <Button 
            onClick={handleYes}
            className="w-full sm:w-auto"
          >
            Yes - Cash / Bank
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

