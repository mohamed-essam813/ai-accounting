/**
 * Legacy quick-action templates (optional; primary UX is guided forms in Prompt Workspace).
 * Kept for any advanced / free-form flow that still imports this module.
 */

export type EventQuickAction = {
  id: string;
  label: string;
  preview: string;
  template: string;
};

export const EVENT_QUICK_ACTIONS: EventQuickAction[] = [
  {
    id: "invoice",
    label: "Sales invoice",
    preview: "Invoice to a customer.",
    template:
      "Create a sales invoice for goods or services sold to a customer. Include amount, tax/VAT if applicable, customer name, and invoice date.",
  },
  {
    id: "bill",
    label: "Supplier bill",
    preview: "Purchase from a supplier.",
    template:
      "Record a bill or purchase invoice from a supplier. Include amount, supplier name, tax if applicable, and date.",
  },
  {
    id: "payment_in",
    label: "Payment received",
    preview: "Money in from a customer.",
    template:
      "Record a payment received from a customer. Include amount, payer, and date.",
  },
  {
    id: "payment_out",
    label: "Payment sent",
    preview: "Money out to a supplier.",
    template:
      "Record a payment made to a supplier. Include amount, payee, and date.",
  },
];
