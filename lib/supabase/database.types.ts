export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
          trade: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          default_ai_reference_config_id: string | null
          subscription_status: 'active' | 'trialing' | 'inactive' | 'canceled' | 'past_due'
          trial_ends_at: string | null
          workspace_pricing_id: string | null
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
          trade?: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          default_ai_reference_config_id?: string | null
          subscription_status?: 'active' | 'trialing' | 'inactive' | 'canceled' | 'past_due'
          trial_ends_at?: string | null
          workspace_pricing_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
          trade?: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          default_ai_reference_config_id?: string | null
          subscription_status?: 'active' | 'trialing' | 'inactive' | 'canceled' | 'past_due'
          trial_ends_at?: string | null
          workspace_pricing_id?: string | null
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          workspace_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member'
          created_at: string
        }
        Insert: {
          workspace_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member'
          created_at?: string
        }
        Update: {
          workspace_id?: string
          user_id?: string
          role?: 'owner' | 'admin' | 'member'
          created_at?: string
        }
        Relationships: []
      }
      workspace_brand: {
        Row: {
          workspace_id: string
          brand_name: string
          accent_color: string | null
          labor_rate: number | null
          logo_bucket: string | null
          logo_path: string | null
          updated_at: string
        }
        Insert: {
          workspace_id: string
          brand_name: string
          accent_color?: string | null
          labor_rate?: number | null
          logo_bucket?: string | null
          logo_path?: string | null
          updated_at?: string
        }
        Update: {
          workspace_id?: string
          brand_name?: string
          accent_color?: string | null
          labor_rate?: number | null
          logo_bucket?: string | null
          logo_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      workspace_settings: {
        Row: {
          workspace_id: string
          tax_rate_percent: number
          markup_percent: number
          hourly_rate: number
          created_at: string
          updated_at: string
        }
        Insert: {
          workspace_id: string
          tax_rate_percent?: number
          markup_percent?: number
          hourly_rate?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          workspace_id?: string
          tax_rate_percent?: number
          markup_percent?: number
          hourly_rate?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      estimate_queue: {
        Row: {
          id: string
          job_id: string
          workspace_id: string
          status: 'pending' | 'running' | 'failed'
          attempts: number
          max_attempts: number
          error_message: string | null
          locked_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          job_id: string
          workspace_id: string
          status?: 'pending' | 'running' | 'failed'
          attempts?: number
          max_attempts?: number
          error_message?: string | null
          locked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          workspace_id?: string
          status?: 'pending' | 'running' | 'failed'
          attempts?: number
          max_attempts?: number
          error_message?: string | null
          locked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          workspace_id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_invites: {
        Row: {
          id: string
          workspace_id: string
          email: string
          role: 'admin' | 'member'
          token_hash: string
          invited_by_user_id: string
          created_at: string
          expires_at: string
          accepted_at: string | null
          accepted_by_user_id: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          email: string
          role?: 'admin' | 'member'
          token_hash: string
          invited_by_user_id: string
          created_at?: string
          expires_at: string
          accepted_at?: string | null
          accepted_by_user_id?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          email?: string
          role?: 'admin' | 'member'
          token_hash?: string
          invited_by_user_id?: string
          created_at?: string
          expires_at?: string
          accepted_at?: string | null
          accepted_by_user_id?: string | null
        }
        Relationships: []
      }
      trial_links: {
        Row: {
          id: string
          workspace_id: string
          token_hash: string
          status: 'active' | 'redeemed' | 'expired' | 'revoked'
          created_by_user_id: string
          redeemed_by_user_id: string | null
          created_at: string
          expires_at: string
          redeemed_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          token_hash: string
          status?: 'active' | 'redeemed' | 'expired' | 'revoked'
          created_by_user_id: string
          redeemed_by_user_id?: string | null
          created_at?: string
          expires_at: string
          redeemed_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          token_hash?: string
          status?: 'active' | 'redeemed' | 'expired' | 'revoked'
          created_by_user_id?: string
          redeemed_by_user_id?: string | null
          created_at?: string
          expires_at?: string
          redeemed_at?: string | null
        }
        Relationships: []
      }
      pricing_materials: {
        Row: {
          id: string
          workspace_id: string
          trade: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          item_key: string
          category: string | null
          sku: string | null
          unit: string | null
          taxable: boolean
          unit_price: number
          aliases: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          trade: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          item_key: string
          category?: string | null
          sku?: string | null
          unit?: string | null
          taxable?: boolean
          unit_price?: number
          aliases?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          trade?: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          item_key?: string
          category?: string | null
          sku?: string | null
          unit?: string | null
          taxable?: boolean
          unit_price?: number
          aliases?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_pricing_materials: {
        Row: {
          id: string
          workspace_id: string
          workspace_pricing_id: string | null
          customer_id: string | null
          trade: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          description: string
          normalized_key: string
          unit: string | null
          unit_cost: number
          source: string
          source_job_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          workspace_pricing_id?: string | null
          customer_id?: string | null
          trade: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          description: string
          normalized_key: string
          unit?: string | null
          unit_cost: number
          source?: string
          source_job_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          workspace_pricing_id?: string | null
          customer_id?: string | null
          trade?: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          description?: string
          normalized_key?: string
          unit?: string | null
          unit_cost?: number
          source?: string
          source_job_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      pricing_labor: {
        Row: {
          id: string
          workspace_id: string
          trade: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          kind: string
          item_key: string
          sku: string | null
          unit: string | null
          rate: number
          taxable: boolean
          aliases: string | null
          notes: string | null
          title: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          trade: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          kind: string
          item_key: string
          sku?: string | null
          unit?: string | null
          rate?: number
          taxable?: boolean
          aliases?: string | null
          notes?: string | null
          title?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          trade?: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          kind?: string
          item_key?: string
          sku?: string | null
          unit?: string | null
          rate?: number
          taxable?: boolean
          aliases?: string | null
          notes?: string | null
          title?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          id: string
          workspace_id: string
          created_by_user_id: string
          title: string
          status:
            | 'draft'
            | 'ai_pending'
            | 'ai_ready'
            | 'pdf_pending'
            | 'complete'
            | 'ai_error'
            | 'pdf_error'
          due_date: string | null
          client_name: string | null
          customer_id: string | null
          description_md: string | null
          template_id: string | null
          labor_rate: number | null
          totals_json: Json | null
          pdf_url: string | null
          error_message: string | null
          estimate_status: string | null
          estimated_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          created_by_user_id: string
          title: string
          status?:
            | 'draft'
            | 'ai_pending'
            | 'ai_ready'
            | 'pdf_pending'
            | 'complete'
            | 'ai_error'
            | 'pdf_error'
          due_date?: string | null
          client_name?: string | null
          customer_id?: string | null
          description_md?: string | null
          template_id?: string | null
          labor_rate?: number | null
          totals_json?: Json | null
          pdf_url?: string | null
          error_message?: string | null
          estimate_status?: string | null
          estimated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          created_by_user_id?: string
          title?: string
          status?:
            | 'draft'
            | 'ai_pending'
            | 'ai_ready'
            | 'pdf_pending'
            | 'complete'
            | 'ai_error'
            | 'pdf_error'
          due_date?: string | null
          client_name?: string | null
          customer_id?: string | null
          description_md?: string | null
          template_id?: string | null
          labor_rate?: number | null
          totals_json?: Json | null
          pdf_url?: string | null
          error_message?: string | null
          estimate_status?: string | null
          estimated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ai_outputs_job_id_fkey'
            columns: ['id']
            referencedRelation: 'ai_outputs'
            referencedColumns: ['job_id']
            isOneToOne: false
          },
          {
            foreignKeyName: 'jobs_customer_id_fkey'
            columns: ['customer_id']
            referencedRelation: 'customers'
            referencedColumns: ['id']
            isOneToOne: false
          },
          {
            foreignKeyName: 'job_files_job_id_fkey'
            columns: ['id']
            referencedRelation: 'job_files'
            referencedColumns: ['job_id']
            isOneToOne: false
          },
          {
            foreignKeyName: 'job_inputs_job_id_fkey'
            columns: ['id']
            referencedRelation: 'job_inputs'
            referencedColumns: ['job_id']
            isOneToOne: true
          },
          {
            foreignKeyName: 'job_items_job_id_fkey'
            columns: ['id']
            referencedRelation: 'job_items'
            referencedColumns: ['job_id']
            isOneToOne: false
          },
        ]
      }
      job_items: {
        Row: {
          id: string
          job_id: string
          type: 'text' | 'link' | 'file' | 'checklist' | 'line_item'
          title: string
          content_json: Json
          order_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          job_id: string
          type: 'text' | 'link' | 'file' | 'checklist' | 'line_item'
          title: string
          content_json: Json
          order_index: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          type?: 'text' | 'link' | 'file' | 'checklist' | 'line_item'
          title?: string
          content_json?: Json
          order_index?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'job_items_job_id_fkey'
            columns: ['job_id']
            referencedRelation: 'jobs'
            referencedColumns: ['id']
            isOneToOne: false
          },
        ]
      }
      job_inputs: {
        Row: {
          job_id: string
          raw_input_json: Json
          created_at: string
        }
        Insert: {
          job_id: string
          raw_input_json: Json
          created_at?: string
        }
        Update: {
          job_id?: string
          raw_input_json?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'job_inputs_job_id_fkey'
            columns: ['job_id']
            referencedRelation: 'jobs'
            referencedColumns: ['id']
            isOneToOne: true
          },
        ]
      }
      ai_outputs: {
        Row: {
          id: string
          job_id: string
          ai_json: Json
          created_at: string
        }
        Insert: {
          id?: string
          job_id: string
          ai_json: Json
          created_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          ai_json?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ai_outputs_job_id_fkey'
            columns: ['job_id']
            referencedRelation: 'jobs'
            referencedColumns: ['id']
            isOneToOne: false
          },
        ]
      }
      job_files: {
        Row: {
          id: string
          job_id: string
          kind: 'pdf' | 'image'
          storage_path: string
          public_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          job_id: string
          kind: 'pdf' | 'image'
          storage_path: string
          public_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          kind?: 'pdf' | 'image'
          storage_path?: string
          public_url?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'job_files_job_id_fkey'
            columns: ['job_id']
            referencedRelation: 'jobs'
            referencedColumns: ['id']
            isOneToOne: false
          },
        ]
      }
      templates: {
        Row: {
          id: string
          workspace_id: string
          created_by_user_id: string
          name: string
          description: string | null
          template_items_json: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          created_by_user_id: string
          name: string
          description?: string | null
          template_items_json: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          created_by_user_id?: string
          name?: string
          description?: string | null
          template_items_json?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      packages: {
        Row: {
          id: string
          job_id: string
          workspace_id: string
          public_slug: string
          is_public: boolean
          brand_header_json: Json
          snapshot_json: Json
          generated_at: string
        }
        Insert: {
          id?: string
          job_id: string
          workspace_id: string
          public_slug: string
          is_public?: boolean
          brand_header_json: Json
          snapshot_json: Json
          generated_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          workspace_id?: string
          public_slug?: string
          is_public?: boolean
          brand_header_json?: Json
          snapshot_json?: Json
          generated_at?: string
        }
        Relationships: []
      }
      ai_reference_configs: {
        Row: {
          id: string
          workspace_id: string
          customer_id: string | null
          trade: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          name: string
          system_prompt: string
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          customer_id?: string | null
          trade: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          name: string
          system_prompt: string
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          customer_id?: string | null
          trade?: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          name?: string
          system_prompt?: string
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          id: string
          trade: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          name: string
          system_prompt: string
          active: boolean
          version: number
          created_at: string
        }
        Insert: {
          id?: string
          trade: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          name: string
          system_prompt: string
          active?: boolean
          version?: number
          created_at?: string
        }
        Update: {
          id?: string
          trade?: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor'
          name?: string
          system_prompt?: string
          active?: boolean
          version?: number
          created_at?: string
        }
        Relationships: []
      }
      template_catalog: {
        Row: {
          id: string
          workspace_id: string
          title: string
          tags: string[]
          summary: string | null
          template_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          title: string
          tags?: string[]
          summary?: string | null
          template_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          title?: string
          tags?: string[]
          summary?: string | null
          template_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_workspace_id: {
        Args: Record<string, never>
        Returns: string | null
      }
      dequeue_estimate_job: {
        Args: Record<string, never>
        Returns: {
          id: string
          job_id: string
          workspace_id: string
          attempts: number
          max_attempts: number
        }[]
      }
      is_member_of: {
        Args: { workspace_id: string }
        Returns: boolean
      }
      is_admin_of: {
        Args: { workspace_id: string }
        Returns: boolean
      }
      search_pricing_candidates: {
        Args: {
          query_text: string
          query_embedding: string | null
          trade: string
          workspace_id: string
          workspace_pricing_id: string | null
          customer_id: string | null
          limit_count?: number
        }
        Returns: {
          source: string
          item_key: string
          description: string
          unit: string | null
          unit_cost: number | null
          unit_price: number | null
          score: number | null
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
