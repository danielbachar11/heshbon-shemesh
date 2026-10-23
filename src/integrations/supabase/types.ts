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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          color: string | null
          household_id: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          name: string
          parent_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          color?: string | null
          household_id?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          parent_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          color?: string | null
          household_id?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          parent_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          avatar: string | null
          color: string | null
          created_at: string
          household_id: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          user_id: string | null
        }
        Insert: {
          avatar?: string | null
          color?: string | null
          created_at?: string
          household_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          user_id?: string | null
        }
        Update: {
          avatar?: string | null
          color?: string | null
          created_at?: string
          household_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          household_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      partner_connections: {
        Row: {
          created_at: string
          created_by: string
          id: string
          user_id_1: string
          user_id_2: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          user_id_1: string
          user_id_2: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          user_id_1?: string
          user_id_2?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string
          id: string
          id_number: string
          last_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_name: string
          id?: string
          id_number: string
          last_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_name?: string
          id?: string
          id_number?: string
          last_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean | null
          message: string | null
          reminder_time: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean | null
          message?: string | null
          reminder_time: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean | null
          message?: string | null
          reminder_time?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_api_keys: {
        Row: {
          created_at: string
          created_by: string
          household_id: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          household_id: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          household_id?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_api_keys_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          api_key_id: string | null
          billing_month: string | null
          created_at: string
          error_details: Json | null
          errors: number
          existing: number
          file_name: string | null
          household_id: string
          id: string
          idempotency_key: string | null
          inserted: number
          kind: string
          needs_review: number
          pending_to_completed: number
          received: number
          result: Json | null
          source: string
          status: string
          updated: number
          user_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          billing_month?: string | null
          created_at?: string
          error_details?: Json | null
          errors?: number
          existing?: number
          file_name?: string | null
          household_id: string
          id?: string
          idempotency_key?: string | null
          inserted?: number
          kind?: string
          needs_review?: number
          pending_to_completed?: number
          received?: number
          result?: Json | null
          source: string
          status?: string
          updated?: number
          user_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          billing_month?: string | null
          created_at?: string
          error_details?: Json | null
          errors?: number
          existing?: number
          file_name?: string | null
          household_id?: string
          id?: string
          idempotency_key?: string | null
          inserted?: number
          kind?: string
          needs_review?: number
          pending_to_completed?: number
          received?: number
          result?: Json | null
          source?: string
          status?: string
          updated?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category_id: string
          charged_date: string | null
          created_at: string
          credit_kind: string | null
          description: string | null
          external_account: string | null
          external_id: string | null
          external_status: string | null
          family_member_id: string | null
          fingerprint: string | null
          household_id: string | null
          id: string
          import_key: string | null
          installment_number: number | null
          installments_total: number | null
          is_recurring: boolean
          last_seen_at: string | null
          linked_transaction_id: string | null
          notes: string | null
          original_amount: number | null
          original_currency: string | null
          payment_method: string | null
          report_date: string | null
          review_reason: string | null
          review_status: string | null
          source: string
          subcategory_id: string | null
          transaction_date: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
          user_modified_fields: string[]
        }
        Insert: {
          amount: number
          category_id: string
          charged_date?: string | null
          created_at?: string
          credit_kind?: string | null
          description?: string | null
          external_account?: string | null
          external_id?: string | null
          external_status?: string | null
          family_member_id?: string | null
          fingerprint?: string | null
          household_id?: string | null
          id?: string
          import_key?: string | null
          installment_number?: number | null
          installments_total?: number | null
          is_recurring?: boolean
          last_seen_at?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          original_amount?: number | null
          original_currency?: string | null
          payment_method?: string | null
          report_date?: string | null
          review_reason?: string | null
          review_status?: string | null
          source?: string
          subcategory_id?: string | null
          transaction_date?: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id: string
          user_modified_fields?: string[]
        }
        Update: {
          amount?: number
          category_id?: string
          charged_date?: string | null
          created_at?: string
          credit_kind?: string | null
          description?: string | null
          external_account?: string | null
          external_id?: string | null
          external_status?: string | null
          family_member_id?: string | null
          fingerprint?: string | null
          household_id?: string | null
          id?: string
          import_key?: string | null
          installment_number?: number | null
          installments_total?: number | null
          is_recurring?: boolean
          last_seen_at?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          original_amount?: number | null
          original_currency?: string | null
          payment_method?: string | null
          report_date?: string | null
          review_reason?: string | null
          review_status?: string | null
          source?: string
          subcategory_id?: string | null
          transaction_date?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
          user_modified_fields?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _credit_file_engine: {
        Args: {
          _dry_run: boolean
          _household: string
          _rows: Json
          _user: string
        }
        Returns: Json
      }
      _try_date: { Args: { t: string }; Returns: string }
      _try_num: { Args: { t: string }; Returns: number }
      admin_move_user_household: {
        Args: { _household_id: string; _user_id: string }
        Returns: undefined
      }
      create_sync_api_key: { Args: { _name?: string }; Returns: string }
      get_partner_id: { Args: { _user_id: string }; Returns: string }
      get_user_household: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_credit_file: {
        Args: {
          _billing_month: string
          _file_name: string
          _idempotency_key: string
          _rows: Json
        }
        Returns: Json
      }
      preview_credit_import: { Args: { _rows: Json }; Returns: Json }
      resolve_sync_review: {
        Args: { _action: string; _id: string }
        Returns: undefined
      }
      revoke_sync_api_key: { Args: { _id: string }; Returns: undefined }
      set_review_charged_date: {
        Args: { _date: string; _id: string }
        Returns: undefined
      }
      sync_ingest: {
        Args: {
          _household: string
          _source: string
          _txns: Json
          _user: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
      transaction_type: "income" | "expense"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
      transaction_type: ["income", "expense"],
    },
  },
} as const
