/** Maps DB `settlement_status` (`unpaid` | `partial` | `paid`) to list/SOA copy. */
export function formatSettlementStatusLabel(raw: string | null | undefined): string {
  switch (raw) {
    case "unpaid":
      return "Unpaid";
    case "partial":
      return "Partially paid";
    case "paid":
      return "Paid";
    default:
      return raw?.replace(/_/g, " ") ?? "—";
  }
}
