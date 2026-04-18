/** UAE home emirate for VAT defaults when customer emirate is unknown. */
export const UAE_EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "UAQ",
  "RAK",
  "Fujairah",
] as const;

export const UAE_INDUSTRIES = [
  "Retail & wholesale",
  "Professional services",
  "Construction & real estate",
  "Hospitality & food",
  "Manufacturing",
  "Technology & software",
  "Healthcare",
  "Education",
  "Transport & logistics",
  "Financial services",
  "Trading",
  "Other",
] as const;

export const ZERO_RATED_VAT_OPTIONS = [
  "Exports outside GCC",
  "International transport",
  "Healthcare (qualifying)",
  "Education (qualifying)",
  "Investment precious metals",
  "Residential buildings (first supply)",
  "Oil & gas / hydrocarbons (qualifying)",
] as const;

export const EXEMPT_VAT_OPTIONS = [
  "Residential property (certain supplies)",
  "Local passenger transport",
  "Certain financial services",
  "Bare land",
  "Life insurance (certain)",
] as const;

export const SETTINGS_SECTIONS = [
  { id: "company-profile", label: "Company Profile" },
  { id: "tax-compliance", label: "Tax & Compliance" },
  { id: "accounting-preferences", label: "Accounting Preferences" },
  { id: "approval-workflow", label: "Approval Workflow" },
  { id: "reports-preferences", label: "Reports Preferences" },
  { id: "users-roles", label: "Users & Roles" },
  { id: "integrations", label: "Integrations" },
] as const;
