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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ally_links: {
        Row: {
          accepted_at: string | null
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ally_links_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ally_links_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ally_mutes: {
        Row: {
          muted_id: string
          user_id: string
        }
        Insert: {
          muted_id: string
          user_id: string
        }
        Update: {
          muted_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ally_mutes_muted_id_fkey"
            columns: ["muted_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ally_mutes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ally_requests: {
        Row: {
          conversation_id: string | null
          created_at: string
          expires_at: string
          id: string
          message: string
          recipient_id: string
          request_id: string | null
          sender_id: string
          status: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          message: string
          recipient_id: string
          request_id?: string | null
          sender_id: string
          status?: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          message?: string
          recipient_id?: string
          request_id?: string | null
          sender_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ally_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ally_requests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ally_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "gpu_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ally_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          actor_id: string | null
          at: string
          booking_id: string
          from_state: string
          id: number
          note: string
          to_state: string
        }
        Insert: {
          actor_id?: string | null
          at?: string
          booking_id: string
          from_state: string
          id?: never
          note?: string
          to_state: string
        }
        Update: {
          actor_id?: string | null
          at?: string
          booking_id?: string
          from_state?: string
          id?: never
          note?: string
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_transitions: {
        Row: {
          actor: string
          from_state: string
          to_state: string
        }
        Insert: {
          actor: string
          from_state: string
          to_state: string
        }
        Update: {
          actor?: string
          from_state?: string
          to_state?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          conversation_id: string
          created_at: string
          host_id: string
          id: string
          offer_id: string
          renter_id: string
          state: string
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          host_id: string
          id?: string
          offer_id: string
          renter_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          host_id?: string
          id?: string
          offer_id?: string
          renter_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: true
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_renter_id_fkey"
            columns: ["renter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          host_id: string
          id: string
          last_message_at: string
          renter_id: string
          request_id: string | null
        }
        Insert: {
          created_at?: string
          host_id: string
          id?: string
          last_message_at?: string
          renter_id: string
          request_id?: string | null
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          last_message_at?: string
          renter_id?: string
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_renter_id_fkey"
            columns: ["renter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "gpu_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      gpu_requests: {
        Row: {
          bandwidth_note: string
          budget_inr: number
          budget_max_inr: number | null
          created_at: string
          details: string
          duration_hours: number
          expires_at: string
          gpu_flexible: boolean
          id: string
          interruption_ok: boolean
          min_vram_gb: number
          preferred_gpu: string
          renter_id: string
          runtime: string
          start_by: string | null
          status: string
          storage_gb: number
          title: string
        }
        Insert: {
          bandwidth_note?: string
          budget_inr: number
          budget_max_inr?: number | null
          created_at?: string
          details?: string
          duration_hours: number
          expires_at?: string
          gpu_flexible?: boolean
          id?: string
          interruption_ok?: boolean
          min_vram_gb: number
          preferred_gpu?: string
          renter_id: string
          runtime?: string
          start_by?: string | null
          status?: string
          storage_gb?: number
          title: string
        }
        Update: {
          bandwidth_note?: string
          budget_inr?: number
          budget_max_inr?: number | null
          created_at?: string
          details?: string
          duration_hours?: number
          expires_at?: string
          gpu_flexible?: boolean
          id?: string
          interruption_ok?: boolean
          min_vram_gb?: number
          preferred_gpu?: string
          renter_id?: string
          runtime?: string
          start_by?: string | null
          status?: string
          storage_gb?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "gpu_requests_renter_id_fkey"
            columns: ["renter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      host_devices: {
        Row: {
          available: boolean
          benchmark_score: number
          created_at: string
          gpu_model: string
          host_id: string
          hourly_rate_inr: number
          id: string
          ram_gb: number
          runtimes: string[]
          verified: boolean
          vram_gb: number
        }
        Insert: {
          available?: boolean
          benchmark_score?: number
          created_at?: string
          gpu_model: string
          host_id: string
          hourly_rate_inr: number
          id?: string
          ram_gb?: number
          runtimes?: string[]
          verified?: boolean
          vram_gb: number
        }
        Update: {
          available?: boolean
          benchmark_score?: number
          created_at?: string
          gpu_model?: string
          host_id?: string
          hourly_rate_inr?: number
          id?: string
          ram_gb?: number
          runtimes?: string[]
          verified?: boolean
          vram_gb?: number
        }
        Relationships: [
          {
            foreignKeyName: "host_devices_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          attachment_type: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          body?: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          emailed_at: string | null
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emailed_at?: string | null
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          emailed_at?: string | null
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          bandwidth_terms: string
          billing_unit: string
          cancellation_terms: string
          conversation_id: string
          created_at: string
          duration_hours: number
          est_total_inr: number
          expires_at: string
          gpu_model: string
          id: string
          interruption_allowed: boolean
          min_specs: string
          proposer_id: string
          recipient_id: string
          responded_at: string | null
          runtime: string
          start_at: string
          status: string
          storage_terms: string
          supersedes_id: string | null
          unit_price_inr: number
          vram_gb: number
        }
        Insert: {
          bandwidth_terms?: string
          billing_unit: string
          cancellation_terms?: string
          conversation_id: string
          created_at?: string
          duration_hours: number
          est_total_inr: number
          expires_at: string
          gpu_model: string
          id?: string
          interruption_allowed?: boolean
          min_specs?: string
          proposer_id: string
          recipient_id: string
          responded_at?: string | null
          runtime?: string
          start_at: string
          status?: string
          storage_terms?: string
          supersedes_id?: string | null
          unit_price_inr: number
          vram_gb: number
        }
        Update: {
          bandwidth_terms?: string
          billing_unit?: string
          cancellation_terms?: string
          conversation_id?: string
          created_at?: string
          duration_hours?: number
          est_total_inr?: number
          expires_at?: string
          gpu_model?: string
          id?: string
          interruption_allowed?: boolean
          min_specs?: string
          proposer_id?: string
          recipient_id?: string
          responded_at?: string | null
          runtime?: string
          start_at?: string
          status?: string
          storage_terms?: string
          supersedes_id?: string | null
          unit_price_inr?: number
          vram_gb?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_settings: {
        Row: {
          allies_see_availability: boolean
          allies_see_completed_count: boolean
          allies_see_devices: boolean
          email_notifications: boolean
          user_id: string
        }
        Insert: {
          allies_see_availability?: boolean
          allies_see_completed_count?: boolean
          allies_see_devices?: boolean
          email_notifications?: boolean
          user_id: string
        }
        Update: {
          allies_see_availability?: boolean
          allies_see_completed_count?: boolean
          allies_see_devices?: boolean
          email_notifications?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          reason: string
          reporter_id: string
          target_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          target_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_responses: {
        Row: {
          created_at: string
          host_id: string
          id: string
          message: string
          request_id: string
        }
        Insert: {
          created_at?: string
          host_id: string
          id?: string
          message: string
          request_id: string
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          message?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_responses_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "gpu_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ally_view: { Args: { _other: string }; Returns: Json }
      are_allies: { Args: { a: string; b: string }; Returns: boolean }
      ask_allies: {
        Args: { _message: string; _recipients: string[]; _request?: string }
        Returns: number
      }
      block_user: { Args: { _target: string }; Returns: undefined }
      can_become_allies: { Args: { a: string; b: string }; Returns: boolean }
      create_offer: {
        Args: {
          _bandwidth_terms: string
          _billing_unit: string
          _cancellation_terms: string
          _conversation: string
          _duration_hours: number
          _expires_at: string
          _gpu_model: string
          _interruption_allowed: boolean
          _min_specs: string
          _runtime: string
          _start_at: string
          _storage_terms: string
          _supersedes?: string
          _unit_price_inr: number
          _vram_gb: number
        }
        Returns: string
      }
      host_stats: {
        Args: { _hosts: string[] }
        Returns: {
          completed: number
          failed: number
          host_id: string
        }[]
      }
      is_blocked: { Args: { a: string; b: string }; Returns: boolean }
      is_participant: { Args: { conv: string; uid: string }; Returns: boolean }
      notify: {
        Args: { k: string; l: string; t: string; uid: string }
        Returns: undefined
      }
      other_party: { Args: { conv: string; uid: string }; Returns: string }
      remove_ally: { Args: { _other: string }; Returns: undefined }
      request_ally: { Args: { _target: string }; Returns: string }
      respond_ally: {
        Args: { _accept: boolean; _link: string }
        Returns: undefined
      }
      respond_ally_ask: {
        Args: { _accept: boolean; _ask: string }
        Returns: string
      }
      respond_offer: {
        Args: { _action: string; _offer: string }
        Returns: string
      }
      start_conversation: {
        Args: { _i_am_host?: boolean; _other: string; _request?: string }
        Returns: string
      }
      transition_booking: {
        Args: { _booking: string; _note?: string; _to: string }
        Returns: string
      }
      withdraw_offer: { Args: { _offer: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
