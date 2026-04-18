import { addMonths, format, getDate, isValid, parseISO, startOfMonth } from "date-fns";

const MIN_YEARS = 1;
const MAX_YEARS = 50;

/**
 * First day of the next calendar month, unless purchase is already on the 1st
 * (then that same month) — used as default depreciation start (conservative).
 */
export function computeDefaultDepreciationStart(purchaseDate: string): string {
  const d = parseISO(purchaseDate);
  if (!isValid(d)) return purchaseDate;
  if (getDate(d) === 1) {
    return format(d, "yyyy-MM-dd");
  }
  return format(startOfMonth(addMonths(d, 1)), "yyyy-MM-dd");
}

export function yearsToMonths(years: number): number {
  return Math.max(1, Math.round(years * 12));
}

export function monthsToDisplayYears(usefulLifeMonths: number): number {
  return usefulLifeMonths / 12;
}

export type LifeValidation = { valid: true } | { valid: false; message: string } | { valid: true; warning: string };

export function validateUsefulLifeYearsInput(y: number): LifeValidation {
  if (Number.isNaN(y) || y <= 0) {
    return { valid: false, message: "Useful life in years is required and must be positive." };
  }
  if (y < MIN_YEARS || y > MAX_YEARS) {
    return {
      valid: true,
      warning: `Values outside ${MIN_YEARS}–${MAX_YEARS} years are unusual. Confirm the useful life is correct for your business.`,
    };
  }
  return { valid: true };
}

type LifeRow = { category: string; life_years: number | null };

const CATEGORY_PATTERNS: { patterns: string[]; years: number }[] = [
  { patterns: ["computer", "laptop", "it ", "server", "network", "workstation", "peripheral", "it equipment"], years: 3 },
  { patterns: ["vehicle", "car", "truck", " van", "lorry", "van "], years: 5 },
  { patterns: ["machine", "machinery", "press", " lathe", "cnc", "pump "], years: 10 },
  { patterns: ["build", "property", "land (", "leasehold", "improvement"], years: 25 },
  { patterns: ["furniture", "fixture", "furnish"], years: 5 },
  { patterns: ["office equipment", " copier", "printer "], years: 5 },
];

/**
 * Picks a default in years for a free-text / category label, using company useful_life_defaults when possible.
 */
export function resolveDefaultUsefulLifeYears(
  categoryLabel: string,
  companyDefaults: LifeRow[] | null | undefined,
): number {
  const norm = categoryLabel.trim().toLowerCase();
  const rows = companyDefaults ?? [];
  for (const r of rows) {
    if (r.life_years == null) continue;
    if (r.category.toLowerCase() === norm) return r.life_years;
  }
  for (const r of rows) {
    if (r.life_years == null) continue;
    const c = r.category.toLowerCase();
    if (norm && (norm.includes(c) || c.includes(norm))) {
      return r.life_years;
    }
  }
  for (const block of CATEGORY_PATTERNS) {
    for (const p of block.patterns) {
      if (p.trim() && norm.includes(p.trim())) {
        return block.years;
      }
    }
  }
  return 5;
}
