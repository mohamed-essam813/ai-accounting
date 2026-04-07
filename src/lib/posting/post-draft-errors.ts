import { z } from "zod";
import { COUNTERPARTY_MISMATCH_CODE } from "@/lib/drafts/counterparty-resolution";
import { getErrorMessage } from "@/lib/utils";

const BALANCE_HINT = /not balanced|Debit.*Credit|debits.*credits/i;

export type PostDraftErrorCode =
  | "VALIDATION_FAILED"
  | "JOURNAL_NOT_BALANCED"
  | "INVALID_ACCOUNT_MAPPING"
  | "MISSING_REQUIRED_FIELD"
  | "TAX_VALIDATION_FAILED"
  | "COUNTERPARTY_MISMATCH"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "PERIOD_CLOSED"
  | "POST_FAILED";

export type PostDraftSuccessData = {
  id: string;
  status: string;
  posted_entry_id: string | null;
};

export type PostDraftResult =
  | { success: true; data: PostDraftSuccessData }
  | {
      success: false;
      error: {
        code: PostDraftErrorCode;
        message: string;
        details?: Record<string, unknown>;
        referenceId: string;
      };
    };

export class PostDraftValidationError extends Error {
  readonly code: PostDraftErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: PostDraftErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PostDraftValidationError";
    this.code = code;
    this.details = details;
  }
}

export function mapUnknownErrorToPostDraftResult(err: unknown, referenceId: string): PostDraftResult {
  if (err instanceof z.ZodError) {
    const msg = err.issues.map((i) => i.message).join("; ") || "Invalid request.";
    return {
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: msg,
        details: { issues: err.issues },
        referenceId,
      },
    };
  }

  if (err instanceof PostDraftValidationError) {
    return {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        referenceId,
      },
    };
  }

  const msg = getErrorMessage(err, "Posting failed. Please try again.");

  let code: PostDraftErrorCode = "POST_FAILED";
  if (BALANCE_HINT.test(msg)) {
    code = "JOURNAL_NOT_BALANCED";
  } else if (msg.includes("not found in chart") || msg.includes("is inactive")) {
    code = "INVALID_ACCOUNT_MAPPING";
  } else if (
    msg.includes("Supplier is required") ||
    msg.includes("Customer is required") ||
    msg.includes("counterparty") ||
    msg.includes("Quantity and Unit Price")
  ) {
    code = "MISSING_REQUIRED_FIELD";
  } else if (
    msg.includes("tax rate") ||
    msg.includes("Multi-line totals") ||
    msg.includes("transaction_amounts") ||
    msg.includes("VAT")
  ) {
    code = "TAX_VALIDATION_FAILED";
  } else if (msg.includes(COUNTERPARTY_MISMATCH_CODE) || msg.includes("differs from the selected")) {
    code = "COUNTERPARTY_MISMATCH";
  } else if (msg.includes("period is closed") || msg.includes("closed through")) {
    code = "PERIOD_CLOSED";
  } else if (msg.includes("permission") || msg.includes("do not have permission")) {
    code = "PERMISSION_DENIED";
  } else if (msg.includes("not found") || msg.includes("Draft not found")) {
    code = "NOT_FOUND";
  } else if (msg.includes("period") && (msg.includes("closed") || msg.includes("lock"))) {
    code = "PERIOD_CLOSED";
  } else if (msg.includes("Other income") || msg.includes("account mapping") || msg.includes("cannot be used")) {
    code = "INVALID_ACCOUNT_MAPPING";
  }

  return {
    success: false,
    error: {
      code,
      message: msg,
      referenceId,
    },
  };
}
