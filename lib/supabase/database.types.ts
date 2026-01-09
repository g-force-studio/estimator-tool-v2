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
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
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
      }
      jobs: {
        Row: {
          id: string
          workspace_id: string
          created_by_user_id: string
          title: string
          status: 'draft' | 'active' | 'delivered' | 'archived'
          due_date: string | null
          client_name: string | null
          description_md: string | null
          template_id: string | null
          labor_rate: number | null
          totals_json: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          created_by_user_id: string
          title: string
          status?: 'draft' | 'active' | 'delivered' | 'archived'
          due_date?: string | null
          client_name?: string | null
          description_md?: string | null
          template_id?: string | null
          labor_rate?: number | null
          totals_json?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          created_by_user_id?: string
          title?: string
          status?: 'draft' | 'active' | 'delivered' | 'archived'
          due_date?: string | null
          client_name?: string | null
          description_md?: string | null
          template_id?: string | null
          labor_rate?: number | null
          totals_json?: Json | null
          created_at?: string
          updated_at?: string
        }
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
      }
      ai_reference_configs: {
        Row: {
          id: string
          workspace_id: string
          name: string
          config_json: Json
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          config_json: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          config_json?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
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
      is_member_of: {
        Args: { workspace_id: string }
        Returns: boolean
      }
      is_admin_of: {
        Args: { workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
