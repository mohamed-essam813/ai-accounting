/**
 * Parse bank statement CSV exports into the same shape as PDF parsing.
 * Uses Papa Parse + shared table logic from parse-pdf-statements.
 */

import Papa from "papaparse";
import {
  parseBankStatementTables,
  type ParsedBankTransaction,
} from "@/lib/bank/parse-pdf-statements";

export type { ParsedBankTransaction };

export function parseBankStatementCsv(fileText: string): ParsedBankTransaction[] {
  const result = Papa.parse<string[]>(fileText, {
    header: false,
    skipEmptyLines: "greedy",
  });

  if (result.errors.length > 0 && process.env.NODE_ENV === "development") {
    console.warn("[parse-csv] Papa warnings", result.errors);
  }

  const rows = (result.data as string[][]).filter((r) =>
    r.some((c) => String(c ?? "").trim().length > 0),
  );

  if (rows.length < 2) {
    return [];
  }

  return parseBankStatementTables([rows]);
}
