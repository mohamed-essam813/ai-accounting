/**
 * BRD Layer 3 — literal “event” shortcuts for the prompt workspace.
 * Each fills the textarea with a clear template the classifier can use.
 */

export type EventQuickAction = {
  id: string;
  label: string;
  /** Shown under the textarea as preview / intent hint */
  preview: string;
  /** Default text inserted when the user taps the chip */
  template: string;
};

/** Six core flows aligned with BRD + app intents (invoice, bill, payments, bank, reporting). */
export const EVENT_QUICK_ACTIONS: EventQuickAction[] = [
  {
    id: "invoice",
    label: "Sales invoice",
    preview: "Invoice to a customer — revenue and AR.",
    template:
      "Create a sales invoice for goods or services sold to a customer. Include amount, tax/VAT if applicable, customer name, and invoice date.",
  },
  {
    id: "bill",
    label: "Supplier bill",
    preview: "Purchase or expense from a supplier — AP and expense.",
    template:
      "Record a bill or purchase invoice from a supplier. Include amount, supplier name, tax if applicable, and date.",
  },
  {
    id: "payment_in",
    label: "Payment received",
    preview: "Customer receipt — cash/bank vs AR.",
    template:
      "Record a payment received from a customer against accounts receivable. Include amount, payer, and date.",
  },
  {
    id: "payment_out",
    label: "Payment sent",
    preview: "Payment to supplier — cash/bank vs AP.",
    template:
      "Record a payment made to a supplier against accounts payable. Include amount, payee, and date.",
  },
  {
    id: "bank",
    label: "Bank / reconciliation",
    preview: "Bank movement or statement line.",
    template:
      "Describe a bank transaction to reconcile or record: amount, date, and what it was for (fees, transfer, loan, etc.).",
  },
  {
    id: "report_journal",
    label: "Report or journal",
    preview: "Report request or manual journal adjustment.",
    template:
      "Generate a financial report or describe a manual journal entry to adjust the books. Include accounts and amounts.",
  },
];
