import { z } from "zod";

/**
 * Turn Zod issues into short, user-facing copy (invoice/bill forms, server actions).
 */
export function formatZodErrorForUser(err: z.ZodError, documentLabel: string): string {
  const i = err.issues[0];
  if (!i) {
    return `${documentLabel} could not be validated. Check all fields and try again.`;
  }

  const path = i.path;
  const lineIdx = path[0] === "lines" && typeof path[1] === "number" ? (path[1] as number) : null;
  const lineHint = lineIdx !== null ? `Line ${lineIdx + 1}: ` : "";

  const lastKey = path[path.length - 1];
  const msgLower = i.message.toLowerCase();
  if (msgLower.includes("uuid") || msgLower.includes("invalid cuid")) {
    if (lastKey === "item_id") {
      return `${lineHint}Select a valid product or service item from the catalog for this line.`;
    }
    if (lastKey === "tax_rate_id") {
      return `${lineHint}Select a valid tax rate or clear the line tax field.`;
    }
    return `${lineHint}A reference field is invalid. Re-select the item or tax rate.`;
  }

  if (i.code === "too_small" && path[0] === "lines") {
    return `Add at least one line with an item and amount.`;
  }

  return `${lineHint}${i.message}`;
}
