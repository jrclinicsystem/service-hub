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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_emails: {
        Row: {
          created_at: string
          email: string
          enabled: boolean
        }
        Insert: {
          created_at?: string
          email: string
          enabled?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          enabled?: boolean
        }
        Relationships: []
      }
      appointments: {
        Row: {
          created_at: string
          id: string
          notes: string
          patient_email: string
          patient_name: string
          patient_phone: string
          professional_id: string | null
          scheduled_date: string
          scheduled_time: string
          service_id: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string
          patient_email: string
          patient_name: string
          patient_phone?: string
          professional_id?: string | null
          scheduled_date: string
          scheduled_time: string
          service_id: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          patient_email?: string
          patient_name?: string
          patient_phone?: string
          professional_id?: string | null
          scheduled_date?: string
          scheduled_time?: string
          service_id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          description: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          description?: string
          id: string
          name: string
          sort_order?: number
        }
        Update: {
          description?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      professional_time_slots: {
        Row: {
          created_at: string
          id: string
          is_available: boolean
          professional_id: string
          slot: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_available?: boolean
          professional_id: string
          slot: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_available?: boolean
          professional_id?: string
          slot?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_time_slots_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          specialty: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          specialty?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          specialty?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          created_at: string
          description: string
          discount_percent: number | null
          ends_at: string | null
          id: string
          is_active: boolean
          promotional_price: number | null
          service_id: string | null
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          discount_percent?: number | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          promotional_price?: number | null
          service_id?: string | null
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          discount_percent?: number | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          promotional_price?: number | null
          service_id?: string | null
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_professionals: {
        Row: {
          professional_id: string
          service_id: string
        }
        Insert: {
          professional_id: string
          service_id: string
        }
        Update: {
          professional_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_professionals_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_professionals_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_reviews: {
        Row: {
          author: string
          body: string
          created_at: string
          id: string
          rating: number
          service_id: string
          when_label: string
        }
        Insert: {
          author: string
          body: string
          created_at?: string
          id?: string
          rating?: number
          service_id: string
          when_label?: string
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          id?: string
          rating?: number
          service_id?: string
          when_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_reviews_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category_id: string
          created_at: string
          description: string
          duration_min: number
          id: string
          includes: string[]
          is_active: boolean
          name: string
          preparation: string[]
          price: number
          professional: string
          professional_role: string
          rating: number
          reviews_count: number
          slug: string
          summary: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string
          duration_min?: number
          id?: string
          includes?: string[]
          is_active?: boolean
          name: string
          preparation?: string[]
          price?: number
          professional?: string
          professional_role?: string
          rating?: number
          reviews_count?: number
          slug: string
          summary?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string
          duration_min?: number
          id?: string
          includes?: string[]
          is_active?: boolean
          name?: string
          preparation?: string[]
          price?: number
          professional?: string
          professional_role?: string
          rating?: number
          reviews_count?: number
          slug?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      time_slots: {
        Row: {
          id: string
          is_available: boolean
          slot: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_available?: boolean
          slot: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_available?: boolean
          slot?: string
          sort_order?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "user"
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
      app_role: ["admin", "staff", "user"],
    },
  },
} as const
