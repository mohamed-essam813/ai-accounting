/**
 * Single source of truth for AR/AP counterparty is contacts.id (draft.contact_id).
 * These helpers normalize names for comparison and handle AI vs user-selected audit fields in data_json.
 */

export function normalizeCounterpartyLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function counterpartyNamesDiffer(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCounterpartyLabel(a ?? "");
  const nb = normalizeCounterpartyLabel(b ?? "");
  if (!na || !nb) return false;
  return na !== nb;
}

export const COUNTERPARTY_MISMATCH_CODE = "COUNTERPARTY_MISMATCH";

export function isCounterpartyMismatchError(message: string): boolean {
  return message.includes(COUNTERPARTY_MISMATCH_CODE) || message.includes("differs from the uploaded document");
}
