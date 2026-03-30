# RevenuesFlow — BRD & MVP schema vs this codebase

This document maps **both** the **BRD (PDF)** and **MVP Database Schema (PDF)** to the **ai-accounting** implementation. Stack remains **Next.js + Supabase**.

---

## 1. BRD — MVP objectives (§2)

| Objective | Status |
|-----------|--------|
| Event-based input | **Done** — Prompt workspace, drafts, intents, OCR uploads |
| Auto accounting entries | **Done** — `buildDefaultJournalLines`, posting to `journal_entries` |
| Sales, expenses, inventory, cash | **Done** — Modules + reports |
| Bank reconciliation | **Done** — PDF + CSV import + match (full PDF `bank_*` schema still optional; see §9) |
| Financial statements | **Done** — P&L, BS, cash flow, TB, VAT, ageing |
| AI insights | **Done** — Generation + PRD four-part cards + metrics engine |
| Financial Timeline | **Done** — `timeline_events` + `/timeline` |

---

## 2. BRD — Layer 1 Accounting engine (§4)

| Requirement | Status |
|-------------|--------|
| Double-entry | **Done** — Trigger + app validation |
| Account types (Bank, AR, AP, …) | **Done** — `chart_of_accounts.type` + `detail_type` + optional **`prd_account_kind`** (BRD roles: bank, AR, AP, …) on create account |
| Journal status Draft / Approved / Posted | **Done** — Manual journals: draft → approved → posted; drafts pipeline: draft → approved → posted |
| Journal lines: contact, currency | **Done** — `journal_lines.contact_id`, `currency_code` (posted from drafts) |
| Journal lines: tax reference | **Done** — **`journal_lines.tax_rate_id`** → `tax_rates` (tax/VAT lines on draft post + optional on manual journals) |
| Tax from settings only | **Done** — `tax_rates` + draft validation |
| Base currency + FX display | **Done** — `base_currency`, `fx_rates`, conversion helpers |

---

## 3. BRD — Layer 2 Business modules (§5)

| Module | Status |
|--------|--------|
| Chart of Accounts | **Done** — With optional category/detail + **PRD account role** |
| Contacts: history, balance, statement, payment history, filters, export | **Done** — Statement + **CSV export** for contacts list |
| Invoices: posting, tax, inventory, **PDF**, draft→approve→post | **Done** — Draft flow + **`invoices`/`invoice_items`** + **`/invoices`** + **`/api/invoices/[id]/pdf`** |
| Bills | **Done** — `bills`/`bill_items` on post + **`/bills`** + **`/api/bills/[id]/pdf`** |
| Payments / receipts | **Done** — `record_payment` drafts + **`payments`** + **`/payments`** |
| Inventory | **Done** — `inventory_items`, movements, COGS |
| Fixed assets | **Done** — Depreciation + disposal journals (`source_module` set) |
| Bank reconciliation | **Partial** — PDF + CSV → `bank_transactions` + match; MVP PDF **`bank_statement_lines`** / **`reconciliations`** not modeled (see §9) |
| Reports list | **Done** — As in README |

---

## 4. BRD — Layer 3 AI (§6)

| Requirement | Status |
|-------------|--------|
| “What happened” / event input | **Done** — Unified prompt (“Tell us what happened”) |
| Event options (sold, bought, …) | **Done** — **Six quick event chips** (invoice, bill, payment in/out, bank, report/journal) + intents / classifier |
| NL + document upload | **Done** — Parse + OCR paths |
| Smart suggestions / real-time intent preview | **Partial** — **Intent preview** line after quick events; full live classifier preview not implemented |
| Document → draft | **Done** — OCR + drafts |

**MVP schema `ai_prompts` / `ai_interpretations`:** not separate tables — behavior in **`drafts`**, **`prompt_sessions`**, **`ai_usage_logs`**.

---

## 5. BRD — Layer 4 Insights (§8)

| Requirement | Status |
|-------------|--------|
| Observation → Risk → Action → Impact | **Done** — `context_json.prd` + `InsightCard` + financial-impact `prd`; **`saveInsights`** always persists normalized PRD block |
| Metrics (revenue growth, margin, AR/AP days, cash runway, expense trends, inventory turnover) | **Partial** — `metrics-engine` / dashboard cover many; not every metric on every screen |

---

## 6. BRD — Security (§9)

| Requirement | Status |
|-------------|--------|
| Posted immutable | **Done** — Posted journals/drafts locked |
| Unpost + audit | **Done** — Void + convert + `audit_logs` |
| Roles | **Done** — `app_users.role` + checks |
| Period lock | **Done** — `accounting_period_closed_through` |

---

## 7. MVP Database Schema (PDF) — domain checklist

| Schema area | Implementation |
|---------------|----------------|
| **tenants** `country`, `fiscal_year_start`, `tax_registration_number` | **Done** — `country`, `fiscal_year_start_month`, `tax_registration_number`; `base_currency` text (not `base_currency_id` FK) |
| **currencies** + **exchange_rates** (normalized) | **Not** — Using **`base_currency` + `fx_rates`** (equivalent behavior) |
| **accounts** (PRD account types) | **Done** — `chart_of_accounts` + **`prd_account_kind`** (optional BRD roles) + codes |
| **journal_entries** `source_module` | **Done** — Column + `drafts` / `manual_journal` / `system_*` |
| **journal_entry_lines** contact, currency, ref, tax | **Done** — `journal_lines` + `contact_id`, `currency_code`, `reference_type`/`reference_id`, **`tax_rate_id`** |
| **contacts** | **Done** |
| **invoices** / **invoice_items** | **Done** |
| **bills** / **bill_items** | **Done** |
| **payments** | **Done** — Table + materialize on `record_payment` post |
| **products** | **Mapped** — **`inventory_items`** (same role) |
| **inventory_movements** | **Mapped** — **`inventory_transactions`** |
| **tax_rates** | **Done** |
| **bank_accounts** / **bank_statement_lines** / **reconciliations** | **Not** — **`bank_transactions`** + bank account selector + PDF/CSV import |
| **ai_prompts** / **ai_interpretations** | **Mapped** — See Layer 3 |
| **timeline_events** | **Done** |
| **attachments** | **Done** — Table **`attachments`** (renamed from `source_documents`; same behavior) |

---

## 8. Migrations (apply in order)

1. `202503290000_alignment_timeline_period_lock.sql`
2. `202503291000_prd_alignment_batch.sql`
3. `202503292000_mvp_schema_residuals.sql`
4. `202503293000_prd_finalize.sql` — `journal_lines.tax_rate_id`, `chart_of_accounts.prd_account_kind`, **`attachments`** rename + RLS

---

## 9. Remaining gaps (honest)

Optional evolution vs strict PDF parity (not required for MVP):

1. **Normalized `currencies` + `exchange_rates` as FKs** (replace text + `fx_rates`).
2. **Bank schema** — `bank_*` tables + `reconciliations` as in PDF vs current `bank_transactions`.
3. **Metrics everywhere** — expose every BRD metric on dashboard / insights surfaces (partial coverage today).

---

_Last audit: PRD finalize batch — attachments rename, tax lines + `tax_rate_id`, `prd_account_kind`, prompt six events + intent preview, migration `202503293000`._
