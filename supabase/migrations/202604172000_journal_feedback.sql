-- Journal feedback: records every AI→user account override.
-- This data is used to fine-tune the AI prompt and surface per-user patterns.

CREATE TABLE IF NOT EXISTS public.journal_feedback (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  journal_entry_id            TEXT        NOT NULL,
  line_id                     TEXT        NOT NULL,
  counterparty                TEXT,
  description                 TEXT,
  transaction_type            TEXT        NOT NULL,
  ai_suggested_account_code   TEXT        NOT NULL,
  user_chosen_account_code    TEXT        NOT NULL,
  user_id                     UUID        NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row-level security: tenants can only see their own feedback rows.
ALTER TABLE public.journal_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal_feedback_tenant_isolation"
  ON public.journal_feedback
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.app_users WHERE auth_user_id = auth.uid()
    )
  );

-- Indices used by the feedback analytics query and the AI prompt few-shot builder.
CREATE INDEX idx_jfb_tenant_created
  ON public.journal_feedback(tenant_id, created_at DESC);

CREATE INDEX idx_jfb_user_counterparty
  ON public.journal_feedback(user_id, counterparty);

CREATE INDEX idx_jfb_transaction_type
  ON public.journal_feedback(transaction_type);
