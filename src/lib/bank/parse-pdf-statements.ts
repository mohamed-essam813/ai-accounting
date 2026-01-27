/**
 * Parse bank statement text extracted from PDF into transactions.
 * Bank Reconciliation = PDF-only. This replaces CSV parsing.
 *
 * Heuristic: split by lines, look for date + amount + description.
 * Bank formats vary; we support common patterns (ISO, DD/MM/YYYY, DD-MM-YYYY, etc.).
 */

export type ParsedBankTransaction = {
  date: string;
  description: string;
  amount: number;
  counterparty?: string | null;
};

const HEADER_WORDS = new Set(
  "date,description,amount,debit,credit,balance,transaction,details,reference,particulars".split(",")
);

/** Match ISO YYYY-MM-DD or DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY */
const DATE_REGEX =
  /(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i;

/** Match amount: optional minus, digits+commas, optional .XX */
const AMOUNT_REGEX = /-?[\d,]+(?:\.\d{2})?/g;

function normalizeDate(s: string): string {
  const trimmed = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y!.length === 2 ? `20${y}` : y!;
    const day = d!.padStart(2, "0");
    const month = mo!.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return trimmed;
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/,/g, "");
  return parseFloat(cleaned) || 0;
}

function looksLikeHeader(line: string): boolean {
  const lower = line.toLowerCase().trim();
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && words.every((w) => HEADER_WORDS.has(w.replace(/[^a-z]/g, ""))))
    return true;
  if (/^(date|description|amount|debit|credit|balance)\s*$/i.test(lower)) return true;
  return false;
}

/** Try tables first (getTable). TableArray = string[][]. */
export function parseBankStatementTables(
  mergedTables: string[][][],
): ParsedBankTransaction[] {
  const out: ParsedBankTransaction[] = [];
  for (const table of mergedTables) {
    if (!table?.length || table.length < 2) continue;
    const header = table[0]!.map((c) => String(c ?? "").toLowerCase().trim());
    const dateIdx = header.findIndex((h) => /date|trans?action\s*date/.test(h));
    const descIdx = header.findIndex((h) =>
      /description|details|particulars|reference|memo/.test(h),
    );
    const amtIdx = header.findIndex((h) =>
      /amount|debit|credit|value/.test(h),
    );
    const amt2Idx =
      amtIdx < 0
        ? header.findIndex((h) => /credit|debit/.test(h))
        : -1;
    for (let i = 1; i < table.length; i++) {
      const row = table[i]!;
      const dateVal =
        dateIdx >= 0 && row[dateIdx] != null
          ? String(row[dateIdx]).trim()
          : "";
      const descVal =
        descIdx >= 0 && row[descIdx] != null
          ? String(row[descIdx]).trim()
          : "";
      let amt = 0;
      if (amtIdx >= 0 && row[amtIdx] != null) {
        amt = parseAmount(String(row[amtIdx]));
      }
      if (amt === 0 && amt2Idx >= 0 && row[amt2Idx] != null) {
        amt = parseAmount(String(row[amt2Idx]));
      }
      if (!dateVal || amt === 0) continue;
      const date = normalizeDate(dateVal);
      out.push({
        date,
        description: descVal || "Bank transaction",
        amount: amt,
        counterparty: null,
      });
    }
  }
  return out;
}

/**
 * Parse raw bank statement text into transactions.
 * Returns empty array if nothing plausible found.
 */
export function parseBankStatementText(text: string): ParsedBankTransaction[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: ParsedBankTransaction[] = [];

  for (const line of lines) {
    if (looksLikeHeader(line)) continue;

    const dateMatch = line.match(DATE_REGEX);
    const amounts = line.match(AMOUNT_REGEX);
    if (!dateMatch || !amounts || amounts.length === 0) continue;

    const dateStr = dateMatch[1]!;
    const date = normalizeDate(dateStr);

    let amount = 0;
    const parsed = amounts.map((a) => parseAmount(a));
    const nonzero = parsed.filter((n) => n !== 0);
    if (nonzero.length === 1) {
      amount = nonzero[0]!;
    } else if (nonzero.length >= 2) {
      const debits = nonzero.filter((n) => n > 0);
      const credits = nonzero.filter((n) => n < 0);
      if (debits.length === 1 && credits.length === 0) amount = debits[0]!;
      else if (credits.length === 1 && debits.length === 0) amount = credits[0]!;
      else amount = nonzero[nonzero.length - 1]!;
    }

    if (amount === 0) continue;

    let description = line;
    for (const a of amounts) {
      description = description.replace(a, " ");
    }
    description = description.replace(dateStr, " ").replace(/\s+/g, " ").trim();
    if (description.length > 200) description = description.slice(0, 200);

    out.push({
      date,
      description: description || "Bank transaction",
      amount,
      counterparty: null,
    });
  }

  return out;
}
