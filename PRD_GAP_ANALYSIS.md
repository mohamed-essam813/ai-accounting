# PRD Gap Analysis: Prompt-First Accounting System

> **Note**: This is a historical document from the initial analysis phase. All gaps identified in this document have been addressed. See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the current status.

## Executive Summary

This document compares the current implementation against the Product Requirements Document (PRD) for a "Prompt-First Accounting as Decision Infrastructure" system. The analysis identifies gaps, missing features, and required changes to align the codebase with the PRD vision.

**Key Finding**: The current system has a solid foundation (prompt parsing, journal entries, reports) but is missing the **core differentiator** - the **Insight Engine** and the **PRD-compliant Dashboard**. The system currently shows data but doesn't generate contextual insights or act as a "financial radar."

**Status**: ✅ All gaps have been resolved. See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for details.

---

## 1. DASHBOARD PHILOSOPHY (CRITICAL GAP)

### PRD Requirements:
- **Financial Radar** (not a summary)
- Answers: "Is anything financially important happening right now?"
- Shows **change over totals**, **states over metrics**, **narratives over charts**
- **Calm by default** - silence is a feature
- **4-6 attention signal tiles** (Cash Flow, Receivables, Payables, Tax Exposure, Revenue Momentum, Expense Control)
- **Financial Pulse** narrative at top
- **Recent Financial Events** (meaningful events, not raw transactions)
- **Banks section** (utility, no balances)

### Current Implementation:
❌ **COMPLETELY MISSING PRD COMPLIANCE**

Current dashboard (`src/app/(app)/dashboard/page.tsx`):
- Shows static totals (Revenue, Expenses, Net Income, Cash Balance)
- Displays full P&L and Balance Sheet tabs
- Shows raw transaction counts
- No financial pulse narrative
- No attention signals
- No state-based indicators (Stable/Improving/Worsening)
- No insight generation
- No meaningful event narratives

### Required Changes:
1. **Complete dashboard redesign** following PRD Section 5
2. Create `FinancialPulse` component (system-generated sentence)
3. Create `AttentionSignals` component (4-6 state-based tiles)
4. Create `RecentFinancialEvents` component (meaningful narratives)
5. Remove static balance displays
6. Add drill-down navigation from signals

---

## 2. INSIGHT ENGINE (CRITICAL MISSING FEATURE)

### PRD Requirements:
- **Primary Differentiator** - generates contextual insights based on financial deltas
- **5 Insight Categories**: Financial Impact, Cash Flow, Risk, Trend/Behavior, Actionable Next Step
- **3 Insight Levels**: Primary (always visible), Secondary (context), Optional deep dive
- **Max 2 insights per action**
- **Plain language only**
- **Always answer "why this matters"**
- **Generated after every transaction posting**

### Current Implementation:
❌ **COMPLETELY MISSING**

- No insight generation logic
- No insight storage/retrieval
- No insight display components
- No insight API endpoints
- No insight database tables

### Required Changes:
1. **Create Insight Engine** (`src/lib/insights/`)
   - `generate-insights.ts` - Core insight generation logic
   - `insight-types.ts` - Type definitions for 5 categories
   - `insight-calculators/` - Calculators for each category
   - `insight-formatter.ts` - Plain language formatter

2. **Database Schema**
   - Create `insights` table
   - Link to journal entries/transactions
   - Store insight level, category, text, metadata

3. **API Integration**
   - Call insight generation after posting drafts/journal entries
   - Store insights in database
   - Retrieve insights for display

4. **UI Components**
   - `InsightCard` component
   - `InsightDisplay` component (primary/secondary/deep dive)
   - Integrate into dashboard and transaction views

5. **Example Flow** (from PRD Section 8):
   - User posts invoice → System generates:
     - Primary: "You are now waiting to collect AED X from Essam & Co."
     - Secondary: "This invoice increased your receivables and is not cash yet."
     - Deep Dive: Ageing + payment behavior

---

## 3. PROMPT ENGINE (PARTIALLY COMPLETE)

### PRD Requirements:
- Natural language prompt parsing ✅
- Extract intent, amount, counterparty, date, tax context ✅
- Detect ambiguity and request clarification ⚠️
- Generate preview before posting ✅
- Auto-generate reference numbers ✅
- No posting without validation ✅
- AI must explain assumptions ⚠️
- User confirmation required ✅

### Current Implementation:
✅ **MOSTLY COMPLETE**

- Prompt parsing works (`src/lib/ai/index.ts`)
- Preview generation works
- Auto invoice numbers work
- Validation works

### Missing/Needs Improvement:
1. **Ambiguity Detection**: Currently fails silently or with generic errors. Need better clarification prompts.
2. **AI Assumption Explanation**: No explicit display of AI assumptions (e.g., "I assumed this is a revenue transaction because...")
3. **Better Error Messages**: More helpful guidance when prompts are unclear

### Required Changes:
1. Enhance ambiguity detection in prompt parser
2. Add "AI Assumptions" section to draft preview
3. Improve error messages with examples

---

## 4. ACCOUNTING ENGINE (COMPLETE)

### PRD Requirements:
- Debit/credit enforcement ✅
- Chart of accounts mapping ✅
- Sub-ledgers (AR, AP, Bank, Tax, Journals) ✅
- Accruals and depreciation ✅
- AI suggestions cannot override accounting rules ✅
- All entries auditable ✅
- Locked entries cannot be edited silently ✅

### Current Implementation:
✅ **COMPLETE**

- Double-entry validation (`ensureBalanced`)
- Account mapping system
- Journal entries with proper structure
- Audit logging
- RAG-based account selection (doesn't override rules)

### No Changes Required

---

## 5. FINANCIAL STATE ENGINE (COMPLETE)

### PRD Requirements:
- Profit & Loss ✅
- Balance Sheet ✅
- Cash Flow Statement ✅
- Trial Balance ✅
- Tax position ✅
- AR/AP ageing ⚠️
- Filters (Monthly, Quarterly, Yearly, Custom) ⚠️

### Current Implementation:
✅ **MOSTLY COMPLETE**

- All core reports exist (`src/lib/data/reports.ts`)
- Views in database
- Tax report exists

### Missing:
1. **AR/AP Ageing Reports**: Not found in codebase
2. **Date Range Filters**: Reports don't have date filtering UI

### Required Changes:
1. Create AR ageing report (by customer, by days overdue)
2. Create AP ageing report (by vendor, by days overdue)
3. Add date range filters to report pages
4. Add monthly/quarterly/yearly preset filters

---

## 6. JOURNALS MODULE (COMPLETE)

### PRD Requirements:
- Separate navigation tab ✅
- Mandatory narration ✅
- Preview impact ✅
- Post-entry insight ❌

### Current Implementation:
✅ **MOSTLY COMPLETE**

- Journals page exists
- Manual entry form works
- Preview works

### Missing:
1. **Post-Entry Insights**: No insights generated after posting journal entries

### Required Changes:
1. Integrate Insight Engine with journal posting
2. Show insights after journal entry is posted

---

## 7. CREDIT NOTES & DEBIT NOTES (COMPLETE)

### PRD Requirements:
- Linked to original invoice/bill ✅
- Adjust revenue/expense, tax, receivable/payable ✅
- Generate explanatory insights ❌

### Current Implementation:
✅ **MOSTLY COMPLETE**

- Credit/debit note intents exist in schema
- Accounting logic correct (`src/lib/accounting.ts`)

### Missing:
1. **Link to Original Invoice/Bill**: No database relationship found
2. **Explanatory Insights**: No insights generated

### Required Changes:
1. Add `original_invoice_id` / `original_bill_id` fields to drafts/journal entries
2. Generate insights explaining the adjustment

---

## 8. AUDIT & TRACEABILITY (COMPLETE)

### PRD Requirements:
- Who created ✅
- Who approved ✅
- Timestamp ✅
- Source (prompt/manual/upload) ⚠️
- Search by invoice number, bill number, counterparty, date range ✅

### Current Implementation:
✅ **MOSTLY COMPLETE**

- Audit log exists
- Search functionality exists (`src/components/audit/audit-log-search.tsx`)

### Missing:
1. **Source Field**: Audit log doesn't explicitly track "prompt" vs "manual" vs "upload"

### Required Changes:
1. Add `source` field to audit logs (or enhance `action` field)
2. Update search to filter by source

---

## 9. REPORTING & EXPORT (PARTIALLY COMPLETE)

### PRD Requirements:
- P&L ✅
- Balance Sheet ✅
- Cash Flow ✅
- Trial Balance ✅
- Ledger ✅
- Tax report ✅
- Export PDF ❌
- Export Excel ❌

### Current Implementation:
✅ **REPORTS EXIST, EXPORTS MISSING**

- All reports exist
- Export buttons component exists (`src/components/reports/export-buttons.tsx`) but functionality unclear

### Required Changes:
1. Implement PDF export (using library like `jsPDF` or `react-pdf`)
2. Implement Excel export (using library like `xlsx`)
3. Ensure export buttons work

---

## 10. NON-FUNCTIONAL REQUIREMENTS

### PRD Requirements:
- Insight response < 2 seconds ⚠️
- Prompt response < 3 seconds ✅
- Role-based access ✅
- Multi-currency ready ✅
- Multi-entity ready ✅

### Current Implementation:
✅ **MOSTLY COMPLETE**

- Prompt parsing is fast (cached)
- RLS policies exist
- Currency support exists
- Multi-tenant architecture exists

### Missing:
1. **Insight Performance**: Can't verify until Insight Engine is built

### Required Changes:
1. Optimize insight generation (cache, async processing)
2. Add performance monitoring

---

## 11. SUPPORTED PROMPT CATEGORIES

### PRD Requirements (Phase 1):
- Customer invoices ✅
- Supplier bills ✅
- Payments received ✅
- Payments made ✅
- Journal entries ✅
- Credit notes ✅
- Debit notes ✅

### Current Implementation:
✅ **ALL SUPPORTED**

No changes required.

---

## 12. CORE PRODUCT PRINCIPLES COMPLIANCE

### PRD Principles:
1. **Accounting truth cannot be bypassed** ✅
2. **AI never posts blindly** ✅
3. **Every transaction must explain itself** ❌
4. **No insight without a financial delta** ❌
5. **Silence equals failure** ❌

### Current Implementation:
⚠️ **PRINCIPLES 3-5 NOT MET**

- Transactions don't explain themselves (no insights)
- No insight generation
- Dashboard is noisy, not calm

### Required Changes:
1. Build Insight Engine (addresses principles 3-5)
2. Redesign dashboard (addresses principle 5)

---

## SUMMARY: REQUIRED WORK

### 🔴 CRITICAL (Must Have):
1. **Insight Engine** - Complete new feature
   - Database schema
   - Generation logic
   - Storage/retrieval
   - UI components
   - Integration with posting flows

2. **Dashboard Redesign** - Complete rewrite
   - Financial Pulse narrative
   - Attention Signals (4-6 tiles)
   - Recent Financial Events
   - Remove static balances
   - State-based indicators

### 🟡 IMPORTANT (Should Have):
3. **AR/AP Ageing Reports**
4. **Date Range Filters** for reports
5. **PDF/Excel Export** functionality
6. **Credit/Debit Note Linking** to originals
7. **Post-Journal Insights**

### 🟢 NICE TO HAVE (Could Have):
8. **Enhanced Ambiguity Detection**
9. **AI Assumption Explanations**
10. **Source Field in Audit Logs**

---

## RECOMMENDED IMPLEMENTATION ORDER

1. **Phase 1: Insight Engine Foundation**
   - Database schema
   - Basic insight generation (Financial Impact, Cash Flow)
   - Storage/retrieval
   - Simple UI component

2. **Phase 2: Dashboard Redesign**
   - Financial Pulse
   - Attention Signals
   - Recent Events
   - Remove old dashboard elements

3. **Phase 3: Complete Insight Engine**
   - All 5 categories
   - All 3 levels
   - Integration with all posting flows

4. **Phase 4: Polish**
   - AR/AP ageing
   - Export functionality
   - Enhanced error messages
   - Performance optimization

---

## ESTIMATED EFFORT

- **Insight Engine**: 3-5 days
- **Dashboard Redesign**: 2-3 days
- **AR/AP Ageing**: 1 day
- **Export Functionality**: 1 day
- **Polish & Integration**: 1-2 days

**Total**: ~8-12 days of focused development

---

## QUESTIONS FOR CLARIFICATION

1. Should insights be generated synchronously (blocking) or asynchronously (background job)?
2. Should insights be stored permanently or regenerated on-demand?
3. What AI model should be used for insight generation? (Same as prompt parsing?)
4. Should the dashboard be real-time or cached (with refresh intervals)?
5. What constitutes a "meaningful financial event" vs a routine transaction?

---

**Document Created**: Based on PRD analysis and codebase review
**Last Updated**: [Current Date]

