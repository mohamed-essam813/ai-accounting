/**
 * Canonical display for chart of accounts in journals and ledgers: code + CoA name (two spaces).
 */
export function formatCoaAccountLabel(code: string | null | undefined, name: string | null | undefined): string {
  const c = (code ?? "").trim();
  const n = (name ?? "").trim();
  if (!c && !n) return "—";
  if (!c) return n;
  if (!n) return c;
  return `${c}  ${n}`;
}
