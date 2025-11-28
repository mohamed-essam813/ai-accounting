export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
      };
      app_users: {
        Row: {
          id: string;
          auth_user_id: string;
          tenant_id: string;
          email: string;
          role: "admin" | "accountant" | "business_user" | "auditor";
          created_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          tenant_id: string;
          email: string;
          role: "admin" | "accountant" | "business_user" | "auditor";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["app_users"]["Insert"]>;
      };
      chart_of_accounts: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          code: string;
          type: "asset" | "liability" | "equity" | "revenue" | "expense";
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          code: string;
          type: "asset" | "liability" | "equity" | "revenue" | "expense";
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["chart_of_accounts"]["Insert"]>;
      };
      journal_entries: {
        Row: {
          id: string;
          tenant_id: string;
          date: string;
          description: string;
          status: "draft" | "posted" | "void";
          created_by: string;
          approved_by: string | null;
          created_at: string;
          posted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          date: string;
          description: string;
          status: "draft" | "posted" | "void";
          created_by: string;
          approved_by?: string | null;
          created_at?: string;
          posted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["journal_entries"]["Insert"]>;
      };
      journal_lines: {
        Row: {
          id: string;
          entry_id: string;
          account_id: string;
          memo: string | null;
          debit: string;
          credit: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          account_id: string;
          memo?: string | null;
          debit?: string;
          credit?: string;
        };
        Update: Partial<Database["public"]["Tables"]["journal_lines"]["Insert"]>;
      };
      drafts: {
        Row: {
          id: string;
          tenant_id: string;
          intent: string;
          data_json: Json;
          status: "draft" | "approved" | "posted";
          created_by: string;
          approved_by: string | null;
          confidence: string | null;
          created_at: string;
          approved_at: string | null;
          posted_entry_id: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          intent: string;
          data_json: Json;
          status?: "draft" | "approved" | "posted";
          created_by: string;
          approved_by?: string | null;
          confidence?: string | null;
          created_at?: string;
          approved_at?: string | null;
          posted_entry_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["drafts"]["Insert"]>;
      };
      bank_transactions: {
        Row: {
          id: string;
          tenant_id: string;
          date: string;
          amount: string;
          description: string;
          counterparty: string | null;
          status: "unmatched" | "matched" | "excluded";
          matched_entry_id: string | null;
          source_file: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          date: string;
          amount: string;
          description: string;
          counterparty?: string | null;
          status?: "unmatched" | "matched" | "excluded";
          matched_entry_id?: string | null;
          source_file?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bank_transactions"]["Insert"]>;
      };
      audit_logs: {
        Row: {
          id: string;
          tenant_id: string;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          changes: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          actor_id?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          changes?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
      };
      intent_account_mappings: {
        Row: {
          id: string;
          tenant_id: string;
          intent: string;
          debit_account_id: string;
          credit_account_id: string;
          tax_debit_account_id: string | null;
          tax_credit_account_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          intent: string;
          debit_account_id: string;
          credit_account_id: string;
          tax_debit_account_id?: string | null;
          tax_credit_account_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["intent_account_mappings"]["Insert"]>;
      };
      source_documents: {
        Row: {
          id: string;
          tenant_id: string;
          created_by: string | null;
          file_path: string;
          file_name: string;
          mime_type: string;
          vision_text: string | null;
          vision_json: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          created_by?: string | null;
          file_path: string;
          file_name: string;
          mime_type: string;
          vision_text?: string | null;
          vision_json?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["source_documents"]["Insert"]>;
      };
      ai_prompt_cache: {
        Row: {
          id: string;
          tenant_id: string;
          prompt_hash: string;
          prompt_text: string;
          model: string;
          response_json: Json;
          usage_count: number;
          created_at: string;
          updated_at: string;
          last_used_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          prompt_hash: string;
          prompt_text: string;
          model: string;
          response_json: Json;
          usage_count?: number;
          created_at?: string;
          updated_at?: string;
          last_used_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_prompt_cache"]["Insert"]>;
      };
      ai_usage_logs: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string | null;
          prompt_hash: string;
          model: string;
          cache_hit: boolean;
          estimated_prompt_tokens: number | null;
          estimated_response_tokens: number | null;
          total_tokens: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id?: string | null;
          prompt_hash: string;
          model: string;
          cache_hit?: boolean;
          estimated_prompt_tokens?: number | null;
          estimated_response_tokens?: number | null;
          total_tokens?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_usage_logs"]["Insert"]>;
      };
      embeddings: {
        Row: {
          id: string;
          tenant_id: string;
          entity_type: "account" | "transaction" | "policy" | "mapping";
          entity_id: string | null;
          content: string;
          embedding: string | null; // Stored as vector type in DB, but returned as string
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          entity_type: "account" | "transaction" | "policy" | "mapping";
          entity_id?: string | null;
          content: string;
          embedding?: string | null; // pgvector format: [0.1,0.2,...]
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["embeddings"]["Insert"]>;
      };
      subscription_plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          price_cents: number;
          currency: string;
          monthly_prompt_limit: number | null;
          monthly_bank_upload_limit: number | null;
          seat_limit: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          price_cents: number;
          currency?: string;
          monthly_prompt_limit?: number | null;
          monthly_bank_upload_limit?: number | null;
          seat_limit?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscription_plans"]["Insert"]>;
      };
      tenant_subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          plan_id: string;
          status: Database["public"]["Enums"]["subscription_status"];
          current_period_start: string | null;
          current_period_end: string | null;
          trial_ends_at: string | null;
          cancel_at: string | null;
          payment_provider: string | null;
          provider_subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          plan_id: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          current_period_start?: string | null;
          current_period_end?: string | null;
          trial_ends_at?: string | null;
          cancel_at?: string | null;
          payment_provider?: string | null;
          provider_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_subscriptions"]["Insert"]>;
      };
      subscription_usage_snapshots: {
        Row: {
          id: string;
          tenant_id: string;
          period_start: string;
          period_end: string;
          prompt_count: number;
          bank_upload_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          period_start: string;
          period_end: string;
          prompt_count?: number;
          bank_upload_count?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscription_usage_snapshots"]["Insert"]>;
      };
      pending_invites: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          role: "admin" | "accountant" | "business_user" | "auditor";
          invited_by: string | null;
          token: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          email: string;
          role: "admin" | "accountant" | "business_user" | "auditor";
          invited_by?: string | null;
          token?: string;
          expires_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pending_invites"]["Insert"]>;
      };
    };
    Views: {
      v_trial_balance: {
        Row: {
          tenant_id: string;
          account_id: string;
          code: string;
          name: string;
          type: "asset" | "liability" | "equity" | "revenue" | "expense";
          total_debit: string | null;
          total_credit: string | null;
        };
      };
      v_profit_and_loss: {
        Row: {
          tenant_id: string;
          total_revenue: string | null;
          total_expense: string | null;
          net_income: string | null;
        };
      };
      v_balance_sheet: {
        Row: {
          tenant_id: string;
          assets: string | null;
          liabilities: string | null;
          equity: string | null;
        };
      };
    };
    Functions: {
      fn_log_audit: {
        Args: {
          p_tenant_id: string;
          p_actor_id: string | null;
          p_action: string;
          p_entity: string;
          p_entity_id: string | null;
          p_changes: Json | null;
        };
        Returns: void;
      };
      match_embeddings: {
        Args: {
          query_embedding: string; // vector(1536) passed as string
          match_tenant_id: string;
          match_threshold?: number;
          match_count?: number;
          entity_types?: string[] | null;
        };
        Returns: Array<{
          id: string;
          entity_type: string;
          entity_id: string | null;
          content: string;
          metadata: Json | null;
          similarity: number;
        }>;
      };
    };
    Enums: {
      subscription_status: "trialing" | "active" | "past_due" | "cancelled";
    };
  };
}

