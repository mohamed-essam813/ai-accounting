/**
 * Pure validation helpers for posting (used by tests and can be wired into services).
 */

export function validatePostingDateNotFuture(dateStr: string): { ok: true } | { ok: false; error: string } {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "Invalid date." };
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d > today) {
    return { ok: false, error: "Transaction date cannot be in the future." };
  }
  return { ok: true };
}
