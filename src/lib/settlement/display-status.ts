/** Maps DB `settlement_status` to founder-friendly labels (DB uses `partial`, not `partially_paid`). */
export function formatSettlementStatusLabel(
  status: string | null | undefined,
): string {
  switch (status) {
    case "unpaid":
      return "Unpaid";
    case "partial":
      return "Partially paid";
    case "paid":
      return "Paid";
    default:
      return status?.replace(/_/g, " ") ?? "—";
  }
}
