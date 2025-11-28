export function formatCurrency(value: number, currency = "AED") {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value || 0);
}

export function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

