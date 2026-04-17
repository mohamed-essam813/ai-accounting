# Journal account override → AI feedback loop

This document describes how manual corrections to AI-suggested ledger accounts are captured and how they can be reused to improve prompts.

## Collection

When a user edits journal lines in the **AI-assisted manual journal** (`JournalEntryEditor`) and overrides an AI-suggested account, the client POSTs anonymized rows to **`POST /api/journal-feedback`**.

Payload shape:

```json
{
  "overrides": [
    {
      "journal_entry_id": "<uuid-or-pending>",
      "line_id": "<client line id>",
      "counterparty": "<optional>",
      "description": "<optional>",
      "transaction_type": "<TransactionType string>",
      "ai_suggested_account_code": "1100",
      "user_chosen_account_code": "1010"
    }
  ]
}
```

Each insert is stored in **`public.journal_feedback`** (see migration `supabase/migrations/*journal_feedback*.sql`). Rows include `tenant_id`, `user_id`, and timestamps for analytics.

## Usage in prompts

1. **Few-shot examples**: Query recent overrides for the same `transaction_type` or `(user_id, counterparty)` and inject short “User prefers X instead of Y when…” snippets into the accounting prompt builder (`src/lib/ai/`).
2. **Per-user preferences**: Rank accounts by frequency of `user_chosen_account_code` given `ai_suggested_account_code` to bias ranking in account selection.

## Operational notes

- Feedback failures are non-blocking for save/post (failures are logged server-side only).
- `journal_entry_id` may be a placeholder until the first successful draft save creates a real `journal_entries.id`; analytics jobs should filter or migrate placeholders if needed.
