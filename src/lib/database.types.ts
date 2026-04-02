export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounting_policies: {
        Row: {
          created_at: string
          effective_date: string
          id: string
          inventory_valuation_method: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_date?: string
          id?: string
          inventory_valuation_method?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_date?: string
          id?: string
          inventory_valuation_method?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_policy_changes: {
        Row: {
          changed_by: string
          created_at: string
          effective_date: string
          id: string
          new_value: string
          policy_type: string
          previous_value: string | null
          reason: string
          tenant_id: string
        }
        Insert: {
          changed_by: string
          created_at?: string
          effective_date: string
          id?: string
          new_value: string
          policy_type: string
          previous_value?: string | null
          reason: string
          tenant_id: string
        }
        Update: {
          changed_by?: string
          created_at?: string
          effective_date?: string
          id?: string
          new_value?: string
          policy_type?: string
          previous_value?: string | null
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_policy_changes_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_policy_changes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_cache: {
        Row: {
          created_at: string
          id: string
          last_used_at: string
          model: string
          prompt_hash: string
          prompt_text: string
          response_json: Json
          tenant_id: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string
          model: string
          prompt_hash: string
          prompt_text: string
          response_json: Json
          tenant_id: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string
          model?: string
          prompt_hash?: string
          prompt_text?: string
          response_json?: Json
          tenant_id?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_cache_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          cache_hit: boolean
          created_at: string
          estimated_prompt_tokens: number | null
          estimated_response_tokens: number | null
          id: string
          model: string
          prompt_hash: string
          tenant_id: string
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          cache_hit?: boolean
          created_at?: string
          estimated_prompt_tokens?: number | null
          estimated_response_tokens?: number | null
          id?: string
          model: string
          prompt_hash: string
          tenant_id: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          cache_hit?: boolean
          created_at?: string
          estimated_prompt_tokens?: number | null
          estimated_response_tokens?: number | null
          id?: string
          model?: string
          prompt_hash?: string
          tenant_id?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_users: {
        Row: {
          auth_user_id: string
          created_at: string
          email: string
          id: string
          role: string
          tenant_id: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          email: string
          id?: string
          role: string
          tenant_id: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          email?: string
          id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string
          id: string
          mime_type: string
          tenant_id: string
          vision_json: Json | null
          vision_text: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path: string
          id?: string
          mime_type: string
          tenant_id: string
          vision_json?: Json | null
          vision_text?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string
          tenant_id?: string
          vision_json?: Json | null
          vision_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          counterparty: string | null
          created_at: string
          date: string
          description: string
          id: string
          matched_entry_id: string | null
          source_file: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          counterparty?: string | null
          created_at?: string
          date: string
          description: string
          id?: string
          matched_entry_id?: string | null
          source_file?: string | null
          status: string
          tenant_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          counterparty?: string | null
          created_at?: string
          date?: string
          description?: string
          id?: string
          matched_entry_id?: string | null
          source_file?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_entry_id_fkey"
            columns: ["matched_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_entry_id_fkey"
            columns: ["matched_entry_id"]
            isOneToOne: false
            referencedRelation: "v_journal_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_items: {
        Row: {
          bill_id: string
          created_at: string
          description: string | null
          id: string
          line_total: number
          product_id: string | null
          quantity: number
          tax_rate_id: string | null
          unit_cost: number
        }
        Insert: {
          bill_id: string
          created_at?: string
          description?: string | null
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          tax_rate_id?: string | null
          unit_cost?: number
        }
        Update: {
          bill_id?: string
          created_at?: string
          description?: string | null
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          tax_rate_id?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount_paid: number
          bill_date: string
          bill_number: string | null
          created_at: string
          currency_code: string | null
          draft_id: string | null
          due_date: string | null
          id: string
          journal_entry_id: string
          outstanding_amount: number
          settlement_status: string
          status: string
          subtotal: number
          supplier_id: string | null
          tax_amount: number
          tenant_id: string
          total_amount: number
        }
        Insert: {
          amount_paid?: number
          bill_date: string
          bill_number?: string | null
          created_at?: string
          currency_code?: string | null
          draft_id?: string | null
          due_date?: string | null
          id?: string
          journal_entry_id: string
          outstanding_amount?: number
          settlement_status?: string
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax_amount?: number
          tenant_id: string
          total_amount?: number
        }
        Update: {
          amount_paid?: number
          bill_date?: string
          bill_number?: string | null
          created_at?: string
          currency_code?: string | null
          draft_id?: string | null
          due_date?: string | null
          id?: string
          journal_entry_id?: string
          outstanding_amount?: number
          settlement_status?: string
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax_amount?: number
          tenant_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "bills_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_journal_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          allow_reconciliation: boolean
          category: string | null
          code: string
          created_at: string
          detail_type: string | null
          id: string
          is_active: boolean
          name: string
          prd_account_kind: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          allow_reconciliation?: boolean
          category?: string | null
          code: string
          created_at?: string
          detail_type?: string | null
          id?: string
          is_active?: boolean
          name: string
          prd_account_kind?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          allow_reconciliation?: boolean
          category?: string | null
          code?: string
          created_at?: string
          detail_type?: string | null
          id?: string
          is_active?: boolean
          name?: string
          prd_account_kind?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          code: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          tax_id: string | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          tax_id?: string | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          tax_id?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      depreciation_schedules: {
        Row: {
          accumulated_depreciation: number
          asset_id: string
          created_at: string
          depreciation_amount: number
          id: string
          journal_entry_id: string | null
          net_book_value: number
          period_end: string
          period_start: string
          tenant_id: string
        }
        Insert: {
          accumulated_depreciation: number
          asset_id: string
          created_at?: string
          depreciation_amount: number
          id?: string
          journal_entry_id?: string | null
          net_book_value: number
          period_end: string
          period_start: string
          tenant_id: string
        }
        Update: {
          accumulated_depreciation?: number
          asset_id?: string
          created_at?: string
          depreciation_amount?: number
          id?: string
          journal_entry_id?: string | null
          net_book_value?: number
          period_end?: string
          period_start?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_fixed_assets_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "depreciation_schedules_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_schedules_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_journal_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "depreciation_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          document_type: string
          fiscal_year: number
          next_number: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          document_type: string
          fiscal_year: number
          next_number?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          document_type?: string
          fiscal_year?: number
          next_number?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          confidence: number | null
          contact_id: string | null
          created_at: string
          created_by: string
          data_json: Json
          id: string
          intent: string
          posted_entry_id: string | null
          status: string
          tax_treatment: string | null
          tenant_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          confidence?: number | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          data_json: Json
          id?: string
          intent: string
          posted_entry_id?: string | null
          status: string
          tax_treatment?: string | null
          tenant_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          confidence?: number | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          data_json?: Json
          id?: string
          intent?: string
          posted_entry_id?: string | null
          status?: string
          tax_treatment?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drafts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafts_posted_entry_id_fkey"
            columns: ["posted_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafts_posted_entry_id_fkey"
            columns: ["posted_entry_id"]
            isOneToOne: false
            referencedRelation: "v_journal_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      embeddings: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "embeddings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_depreciation_schedule: {
        Row: {
          amount: number
          asset_id: string
          created_at: string
          id: string
          period_start: string
          posted_entry_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          asset_id: string
          created_at?: string
          id?: string
          period_start: string
          posted_entry_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          asset_id?: string
          created_at?: string
          id?: string
          period_start?: string
          posted_entry_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_depreciation_schedule_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_depreciation_schedule_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_fixed_assets_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "fixed_asset_depreciation_schedule_posted_entry_id_fkey"
            columns: ["posted_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_depreciation_schedule_posted_entry_id_fkey"
            columns: ["posted_entry_id"]
            isOneToOne: false
            referencedRelation: "v_journal_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "fixed_asset_depreciation_schedule_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets: {
        Row: {
          category: string
          cost: number
          created_at: string
          depreciation_method: string
          description: string | null
          disposal_gain_loss: number | null
          disposal_proceeds: number | null
          disposed_at: string | null
          id: string
          is_active: boolean
          name: string
          purchase_date: string
          residual_value: number
          start_depreciation_date: string | null
          tenant_id: string
          updated_at: string
          useful_life_months: number
        }
        Insert: {
          category: string
          cost: number
          created_at?: string
          depreciation_method: string
          description?: string | null
          disposal_gain_loss?: number | null
          disposal_proceeds?: number | null
          disposed_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          purchase_date: string
          residual_value?: number
          start_depreciation_date?: string | null
          tenant_id: string
          updated_at?: string
          useful_life_months: number
        }
        Update: {
          category?: string
          cost?: number
          created_at?: string
          depreciation_method?: string
          description?: string | null
          disposal_gain_loss?: number | null
          disposal_proceeds?: number | null
          disposed_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          purchase_date?: string
          residual_value?: number
          start_depreciation_date?: string | null
          tenant_id?: string
          updated_at?: string
          useful_life_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          created_at: string
          date: string
          from_currency: string
          id: string
          rate: number
          tenant_id: string
          to_currency: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          from_currency: string
          id?: string
          rate: number
          tenant_id: string
          to_currency: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          from_currency?: string
          id?: string
          rate?: number
          tenant_id?: string
          to_currency?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          category: string
          context_json: Json | null
          created_at: string
          draft_id: string | null
          id: string
          insight_text: string
          journal_entry_id: string | null
          level: string
          tenant_id: string
        }
        Insert: {
          category: string
          context_json?: Json | null
          created_at?: string
          draft_id?: string | null
          id?: string
          insight_text: string
          journal_entry_id?: string | null
          level: string
          tenant_id: string
        }
        Update: {
          category?: string
          context_json?: Json | null
          created_at?: string
          draft_id?: string | null
          id?: string
          insight_text?: string
          journal_entry_id?: string | null
          level?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_journal_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      intent_account_mappings: {
        Row: {
          created_at: string
          credit_account_id: string
          debit_account_id: string
          id: string
          intent: string
          tax_credit_account_id: string | null
          tax_debit_account_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          credit_account_id: string
          debit_account_id: string
          id?: string
          intent: string
          tax_credit_account_id?: string | null
          tax_debit_account_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          credit_account_id?: string
          debit_account_id?: string
          id?: string
          intent?: string
          tax_credit_account_id?: string | null
          tax_debit_account_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intent_account_mappings_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intent_account_mappings_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "intent_account_mappings_debit_account_id_fkey"
            columns: ["debit_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intent_account_mappings_debit_account_id_fkey"
            columns: ["debit_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "intent_account_mappings_tax_credit_account_id_fkey"
            columns: ["tax_credit_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intent_account_mappings_tax_credit_account_id_fkey"
            columns: ["tax_credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "intent_account_mappings_tax_debit_account_id_fkey"
            columns: ["tax_debit_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intent_account_mappings_tax_debit_account_id_fkey"
            columns: ["tax_debit_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "intent_account_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_ageing: {
        Row: {
          ageing_bucket: string
          batch_number: number | null
          created_at: string
          days_in_stock: number
          id: string
          item_id: string
          purchase_date: string
          quantity: number
          tenant_id: string
          total_value: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          ageing_bucket: string
          batch_number?: number | null
          created_at?: string
          days_in_stock: number
          id?: string
          item_id: string
          purchase_date: string
          quantity: number
          tenant_id: string
          total_value: number
          unit_cost: number
          updated_at?: string
        }
        Update: {
          ageing_bucket?: string
          batch_number?: number | null
          created_at?: string
          days_in_stock?: number
          id?: string
          item_id?: string
          purchase_date?: string
          quantity?: number
          tenant_id?: string
          total_value?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_ageing_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ageing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          average_cost: number | null
          id: string
          item_id: string
          last_transaction_date: string | null
          quantity: number
          tenant_id: string
          total_value: number
          updated_at: string
        }
        Insert: {
          average_cost?: number | null
          id?: string
          item_id: string
          last_transaction_date?: string | null
          quantity?: number
          tenant_id: string
          total_value?: number
          updated_at?: string
        }
        Update: {
          average_cost?: number | null
          id?: string
          item_id?: string
          last_transaction_date?: string | null
          quantity?: number
          tenant_id?: string
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          cogs_account_id: string | null
          cost_price: number | null
          created_at: string
          default_tax_rate_id: string | null
          description: string | null
          expense_account_id: string | null
          id: string
          inventory_account_id: string | null
          inventory_tracked: boolean
          is_active: boolean
          item_type: string
          keywords: string | null
          name: string
          revenue_account_id: string | null
          selling_price: number | null
          sku: string | null
          tenant_id: string
          unit: string
          uom_id: string
          updated_at: string
          valuation_method: string
        }
        Insert: {
          cogs_account_id?: string | null
          cost_price?: number | null
          created_at?: string
          default_tax_rate_id?: string | null
          description?: string | null
          expense_account_id?: string | null
          id?: string
          inventory_account_id?: string | null
          inventory_tracked?: boolean
          is_active?: boolean
          item_type?: string
          keywords?: string | null
          name: string
          revenue_account_id?: string | null
          selling_price?: number | null
          sku?: string | null
          tenant_id: string
          unit?: string
          uom_id: string
          updated_at?: string
          valuation_method: string
        }
        Update: {
          cogs_account_id?: string | null
          cost_price?: number | null
          created_at?: string
          default_tax_rate_id?: string | null
          description?: string | null
          expense_account_id?: string | null
          id?: string
          inventory_account_id?: string | null
          inventory_tracked?: boolean
          is_active?: boolean
          item_type?: string
          keywords?: string | null
          name?: string
          revenue_account_id?: string | null
          selling_price?: number | null
          sku?: string | null
          tenant_id?: string
          unit?: string
          uom_id?: string
          updated_at?: string
          valuation_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_cogs_account_id_fkey"
            columns: ["cogs_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_cogs_account_id_fkey"
            columns: ["cogs_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_items_default_tax_rate_id_fkey"
            columns: ["default_tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_items_inventory_account_id_fkey"
            columns: ["inventory_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_inventory_account_id_fkey"
            columns: ["inventory_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_items_revenue_account_id_fkey"
            columns: ["revenue_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_revenue_account_id_fkey"
            columns: ["revenue_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          batch_number: number | null
          cogs_amount: number | null
          created_at: string
          date: string
          draft_id: string | null
          id: string
          item_id: string
          journal_entry_id: string | null
          notes: string | null
          quantity: number
          tenant_id: string
          total_cost: number
          transaction_type: string
          unit_cost: number
        }
        Insert: {
          batch_number?: number | null
          cogs_amount?: number | null
          created_at?: string
          date: string
          draft_id?: string | null
          id?: string
          item_id: string
          journal_entry_id?: string | null
          notes?: string | null
          quantity: number
          tenant_id: string
          total_cost: number
          transaction_type: string
          unit_cost: number
        }
        Update: {
          batch_number?: number | null
          cogs_amount?: number | null
          created_at?: string
          date?: string
          draft_id?: string | null
          id?: string
          item_id?: string
          journal_entry_id?: string | null
          notes?: string | null
          quantity?: number
          tenant_id?: string
          total_cost?: number
          transaction_type?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_journal_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "inventory_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          line_total: number
          product_id: string | null
          quantity: number
          tax_rate_id: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          tax_rate_id?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          tax_rate_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_received: number
          created_at: string
          currency_code: string | null
          customer_id: string | null
          draft_id: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string | null
          journal_entry_id: string
          outstanding_amount: number
          settlement_status: string
          status: string
          subtotal: number
          tax_amount: number
          tenant_id: string
          total_amount: number
        }
        Insert: {
          amount_received?: number
          created_at?: string
          currency_code?: string | null
          customer_id?: string | null
          draft_id?: string | null
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_number?: string | null
          journal_entry_id: string
          outstanding_amount?: number
          settlement_status?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tenant_id: string
          total_amount?: number
        }
        Update: {
          amount_received?: number
          created_at?: string
          currency_code?: string | null
          customer_id?: string | null
          draft_id?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          journal_entry_id?: string
          outstanding_amount?: number
          settlement_status?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tenant_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_journal_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          amount_in_base_currency: number | null
          amount_in_transaction_currency: number | null
          approved_by: string | null
          base_currency: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          date: string
          description: string
          fx_rate: number | null
          id: string
          posted_at: string | null
          source_module: string | null
          status: string
          tenant_id: string
          transaction_currency: string | null
        }
        Insert: {
          amount_in_base_currency?: number | null
          amount_in_transaction_currency?: number | null
          approved_by?: string | null
          base_currency?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          date: string
          description: string
          fx_rate?: number | null
          id?: string
          posted_at?: string | null
          source_module?: string | null
          status: string
          tenant_id: string
          transaction_currency?: string | null
        }
        Update: {
          amount_in_base_currency?: number | null
          amount_in_transaction_currency?: number | null
          approved_by?: string | null
          base_currency?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          date?: string
          description?: string
          fx_rate?: number | null
          id?: string
          posted_at?: string | null
          source_module?: string | null
          status?: string
          tenant_id?: string
          transaction_currency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          account_source: string | null
          contact_id: string | null
          credit: number
          currency_code: string | null
          debit: number
          entry_id: string
          id: string
          memo: string | null
          reference_id: string | null
          reference_type: string | null
          tax_rate_id: string | null
        }
        Insert: {
          account_id: string
          account_source?: string | null
          contact_id?: string | null
          credit?: number
          currency_code?: string | null
          debit?: number
          entry_id: string
          id?: string
          memo?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tax_rate_id?: string | null
        }
        Update: {
          account_id?: string
          account_source?: string | null
          contact_id?: string | null
          credit?: number
          currency_code?: string | null
          debit?: number
          entry_id?: string
          id?: string
          memo?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tax_rate_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_lines_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "v_journal_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "journal_lines_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_templates: {
        Row: {
          created_at: string
          description_default: string | null
          id: string
          is_system: boolean
          lines: Json
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_default?: string | null
          id?: string
          is_system?: boolean
          lines: Json
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_default?: string | null
          id?: string
          is_system?: boolean
          lines?: Json
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          allocated_amount: number
          bill_id: string
          created_at: string
          id: string
          payment_id: string
          tenant_id: string
        }
        Insert: {
          allocated_amount: number
          bill_id: string
          created_at?: string
          id?: string
          payment_id: string
          tenant_id: string
        }
        Update: {
          allocated_amount?: number
          bill_id?: string
          created_at?: string
          id?: string
          payment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          contact_id: string | null
          created_at: string
          currency_code: string | null
          draft_id: string | null
          id: string
          journal_entry_id: string
          payment_date: string
          payment_type: string
          reference: string | null
          tenant_id: string
          voucher_number: string | null
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency_code?: string | null
          draft_id?: string | null
          id?: string
          journal_entry_id: string
          payment_date: string
          payment_type: string
          reference?: string | null
          tenant_id: string
          voucher_number?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency_code?: string | null
          draft_id?: string | null
          id?: string
          journal_entry_id?: string
          payment_date?: string
          payment_type?: string
          reference?: string | null
          tenant_id?: string
          voucher_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "payments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_journal_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          tenant_id: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role: string
          tenant_id: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_sessions: {
        Row: {
          created_at: string
          created_by: string
          created_dependencies: Json | null
          data_json: Json | null
          detected_intent: string | null
          document_ids: Json | null
          draft_id: string | null
          error_message: string | null
          id: string
          original_prompt_text: string
          pending_questions: Json | null
          resolved_fields: Json | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          created_dependencies?: Json | null
          data_json?: Json | null
          detected_intent?: string | null
          document_ids?: Json | null
          draft_id?: string | null
          error_message?: string | null
          id?: string
          original_prompt_text: string
          pending_questions?: Json | null
          resolved_fields?: Json | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          created_dependencies?: Json | null
          data_json?: Json | null
          detected_intent?: string | null
          document_ids?: Json | null
          draft_id?: string | null
          error_message?: string | null
          id?: string
          original_prompt_text?: string
          pending_questions?: Json | null
          resolved_fields?: Json | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_sessions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_allocations: {
        Row: {
          allocated_amount: number
          created_at: string
          id: string
          invoice_id: string
          receipt_id: string
          tenant_id: string
        }
        Insert: {
          allocated_amount: number
          created_at?: string
          id?: string
          invoice_id: string
          receipt_id: string
          tenant_id: string
        }
        Update: {
          allocated_amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          receipt_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_allocations_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subledgers: {
        Row: {
          balance: number
          contact_id: string
          created_at: string
          gl_account_id: string
          id: string
          subledger_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          contact_id: string
          created_at?: string
          gl_account_id: string
          id?: string
          subledger_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          contact_id?: string
          created_at?: string
          gl_account_id?: string
          id?: string
          subledger_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subledgers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subledgers_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subledgers_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "subledgers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          monthly_bank_upload_limit: number | null
          monthly_prompt_limit: number | null
          name: string
          price_cents: number
          seat_limit: number | null
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_bank_upload_limit?: number | null
          monthly_prompt_limit?: number | null
          name: string
          price_cents: number
          seat_limit?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_bank_upload_limit?: number | null
          monthly_prompt_limit?: number | null
          name?: string
          price_cents?: number
          seat_limit?: number | null
        }
        Relationships: []
      }
      subscription_usage_snapshots: {
        Row: {
          bank_upload_count: number
          created_at: string
          id: string
          period_end: string
          period_start: string
          prompt_count: number
          tenant_id: string
        }
        Insert: {
          bank_upload_count?: number
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          prompt_count?: number
          tenant_id: string
        }
        Update: {
          bank_upload_count?: number
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          prompt_count?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_usage_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          created_at: string
          id: string
          input_vat_account_id: string | null
          is_active: boolean
          name: string
          output_vat_account_id: string | null
          percentage: number
          rate: number
          tax_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_vat_account_id?: string | null
          is_active?: boolean
          name: string
          output_vat_account_id?: string | null
          percentage: number
          rate: number
          tax_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          input_vat_account_id?: string | null
          is_active?: boolean
          name?: string
          output_vat_account_id?: string | null
          percentage?: number
          rate?: number
          tax_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_input_vat_account_id_fkey"
            columns: ["input_vat_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rates_input_vat_account_id_fkey"
            columns: ["input_vat_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "tax_rates_output_vat_account_id_fkey"
            columns: ["output_vat_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rates_output_vat_account_id_fkey"
            columns: ["output_vat_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "tax_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          cancel_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          payment_provider: string | null
          plan_id: string
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payment_provider?: string | null
          plan_id: string
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payment_provider?: string | null
          plan_id?: string
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accounting_period_closed_through: string | null
          address: string | null
          base_currency: string
          country: string | null
          created_at: string
          document_footer_text: string | null
          fiscal_year_start_month: number | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          tax_registration_number: string | null
        }
        Insert: {
          accounting_period_closed_through?: string | null
          address?: string | null
          base_currency?: string
          country?: string | null
          created_at?: string
          document_footer_text?: string | null
          fiscal_year_start_month?: number | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          tax_registration_number?: string | null
        }
        Update: {
          accounting_period_closed_through?: string | null
          address?: string | null
          base_currency?: string
          country?: string | null
          created_at?: string
          document_footer_text?: string | null
          fiscal_year_start_month?: number | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          tax_registration_number?: string | null
        }
        Relationships: []
      }
      timeline_events: {
        Row: {
          created_at: string
          description: string
          event_date: string
          event_type: string
          id: string
          reference_id: string
          reference_type: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          description: string
          event_date: string
          event_type: string
          id?: string
          reference_id: string
          reference_type: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          description?: string
          event_date?: string
          event_type?: string
          id?: string
          reference_id?: string
          reference_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      units_of_measure: {
        Row: {
          abbreviation: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          abbreviation: string
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_of_measure_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_ap_ageing: {
        Row: {
          bill_number: string | null
          current_0_30: number | null
          days_31_60: number | null
          days_61_90: number | null
          days_90_plus: number | null
          days_overdue: number | null
          due_date: string | null
          entry_date: string | null
          outstanding_amount: number | null
          tenant_id: string | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ap_ageing_summary: {
        Row: {
          tenant_id: string | null
          total_31_60: number | null
          total_61_90: number | null
          total_90_plus: number | null
          total_current: number | null
          total_outstanding: number | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ar_ageing: {
        Row: {
          current_0_30: number | null
          customer_name: string | null
          days_31_60: number | null
          days_61_90: number | null
          days_90_plus: number | null
          days_overdue: number | null
          due_date: string | null
          entry_date: string | null
          invoice_number: string | null
          outstanding_amount: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ar_ageing_summary: {
        Row: {
          customer_name: string | null
          tenant_id: string | null
          total_31_60: number | null
          total_61_90: number | null
          total_90_plus: number | null
          total_current: number | null
          total_outstanding: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_balance_sheet: {
        Row: {
          assets: number | null
          equity: number | null
          liabilities: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cash_flow: {
        Row: {
          net_cash_flow: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fixed_assets_summary: {
        Row: {
          accumulated_depreciation: number | null
          asset_id: string | null
          category: string | null
          cost: number | null
          depreciation_method: string | null
          disposal_gain_loss: number | null
          disposal_proceeds: number | null
          disposed_at: string | null
          is_active: boolean | null
          months_depreciated: number | null
          name: string | null
          net_book_value: number | null
          purchase_date: string | null
          residual_value: number | null
          start_depreciation_date: string | null
          tenant_id: string | null
          useful_life_months: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inventory_summary: {
        Row: {
          average_cost: number | null
          item_id: string | null
          item_name: string | null
          last_transaction_date: string | null
          quantity: number | null
          quantity_0_30: number | null
          quantity_31_60: number | null
          quantity_61_90: number | null
          quantity_90_plus: number | null
          sku: string | null
          tenant_id: string | null
          total_value: number | null
          valuation_method: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_journal_ledger: {
        Row: {
          account_code: string | null
          account_name: string | null
          created_at: string | null
          credit: number | null
          date: string | null
          debit: number | null
          description: string | null
          entry_id: string | null
          memo: string | null
          status: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_profit_and_loss: {
        Row: {
          gain_loss_on_disposal: number | null
          net_income: number | null
          operating_profit: number | null
          tenant_id: string | null
          total_expense: number | null
          total_revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_recent_primary_insights: {
        Row: {
          category: string | null
          context_json: Json | null
          created_at: string | null
          draft_id: string | null
          id: string | null
          insight_text: string | null
          journal_entry_id: string | null
          tenant_id: string | null
          transaction_date: string | null
          transaction_description: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insights_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_journal_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_trial_balance: {
        Row: {
          account_id: string | null
          code: string | null
          name: string | null
          tenant_id: string | null
          total_credit: number | null
          total_debit: number | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_vat_report: {
        Row: {
          tenant_id: string | null
          vat_input_tax: number | null
          vat_output_tax: number | null
          vat_payable: number | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calculate_cogs_fifo: {
        Args: {
          p_date: string
          p_item_id: string
          p_quantity: number
          p_tenant_id: string
        }
        Returns: number
      }
      calculate_cogs_weighted_average: {
        Args: { p_item_id: string; p_quantity: number; p_tenant_id: string }
        Returns: number
      }
      calculate_depreciation_reducing_balance: {
        Args: {
          p_cost: number
          p_current_nbv: number
          p_residual_value: number
          p_useful_life_months: number
        }
        Returns: number
      }
      calculate_depreciation_straight_line: {
        Args: {
          p_cost: number
          p_residual_value: number
          p_useful_life_months: number
        }
        Returns: number
      }
      fn_log_audit: {
        Args: {
          p_action: string
          p_actor_id: string
          p_changes: Json
          p_entity: string
          p_entity_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      generate_contact_code: {
        Args: { p_tenant_id: string; p_type: string }
        Returns: string
      }
      get_current_user_tenant_id: { Args: never; Returns: string }
      match_embeddings: {
        Args: {
          entity_types?: string[]
          match_count?: number
          match_tenant_id: string
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      next_document_number: {
        Args: { p_date: string; p_document_type: string; p_tenant_id: string }
        Returns: string
      }
      recompute_bill_settlement: {
        Args: { p_bill_id: string }
        Returns: undefined
      }
      recompute_invoice_settlement: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      seed_journal_templates_for_tenant: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      tax_rate_used_in_posted_drafts: {
        Args: { p_rate_id: string; p_tenant_id: string }
        Returns: boolean
      }
      update_inventory_ageing: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
    }
    Enums: {
      subscription_status: "trialing" | "active" | "past_due" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      subscription_status: ["trialing", "active", "past_due", "cancelled"],
    },
  },
} as const
