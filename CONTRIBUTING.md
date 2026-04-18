# Contributing

## Drafts and AI output

The AI draft is the single source of truth. All UI surfaces (Edit Details, Journal Preview, posting, exports) are read-only projections of the draft payload and server-built journal lines. User edits mutate the draft or `edited_journal_lines`; every projection should re-fetch or derive from that same data. No component should maintain independent state that duplicates draft fields (for example, a separate expense account id that is not reconciled with the journal preview debit).

When validating AI journal lines at save time, `account_code` must exist on the tenant chart of accounts. Ignore any `account_name` from the model — display names always come from the chart of accounts.

The Edit Draft modal wraps content in `DraftEditStoreProvider` (`src/contexts/draft-edit-store.tsx`), which loads `getDraftJournalPreview` once and shares it with the Journal Preview tab so the preview is not a separate ad hoc data source.
