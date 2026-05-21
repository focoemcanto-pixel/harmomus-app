export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          role: "admin" | "member";
          email: string | null;
          legacy_pms_member_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: "admin" | "member";
          email?: string | null;
          legacy_pms_member_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      plans: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          price_cents: number;
          legacy_pms_plan_id: string | null;
          currency: string;
          trial_days: number;
          hierarchy_level: number;
          status: "active" | "inactive";
          stripe_price_id: string | null;
          features: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          price_cents: number;
          legacy_pms_plan_id?: string | null;
          currency?: string;
          trial_days?: number;
          hierarchy_level?: number;
          status?: "active" | "inactive";
          stripe_price_id?: string | null;
          features?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["plans"]["Insert"]>;
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan_id: string;
          legacy_pms_subscription_id: string | null;
          status: "active" | "overdue" | "canceled" | "expired" | "pending";
          starts_at: string | null;
          current_period_end: string | null;
          trial_ends_at: string | null;
          auto_renew: boolean;
          gateway: string | null;
          gateway_customer_id: string | null;
          gateway_subscription_id: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_price_id: string | null;
          next_billing_at: string | null;
          canceled_at: string | null;
          last_webhook_event: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_id: string;
          legacy_pms_subscription_id?: string | null;
          status?: "active" | "overdue" | "canceled" | "expired" | "pending";
          starts_at?: string | null;
          current_period_end?: string | null;
          trial_ends_at?: string | null;
          auto_renew?: boolean;
          gateway?: string | null;
          gateway_customer_id?: string | null;
          gateway_subscription_id?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_price_id?: string | null;
          next_billing_at?: string | null;
          canceled_at?: string | null;
          last_webhook_event?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
      };
      billing_events: {
        Row: { id: string; provider: string; event_type: string; payload: Json; processed: boolean; created_at: string; };
        Insert: { id?: string; provider: string; event_type: string; payload: Json; processed?: boolean; created_at?: string; };
        Update: Partial<Database["public"]["Tables"]["billing_events"]["Insert"]>;
      };

      migration_logs: {
        Row: {
          id: string;
          migration_name: string;
          source: string;
          status: "pending" | "running" | "success" | "error";
          details: string | null;
          payload: Json | null;
          executed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          migration_name: string;
          source?: string;
          status: "pending" | "running" | "success" | "error";
          details?: string | null;
          payload?: Json | null;
          executed_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["migration_logs"]["Insert"]>;
      };
      audio_access_logs: {
        Row: {
          id: string;
          user_id: string | null;
          kit_id: string;
          audio_file_id: string;
          status: string;
          reason: string;
          accessed_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          kit_id: string;
          audio_file_id: string;
          status: string;
          reason: string;
          accessed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audio_access_logs"]["Insert"]>;
      };

      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          cover_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          cover_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
      };
      kit_audio_files: {
        Row: {
          id: string;
          kit_id: string;
          tone: string;
          name: string;
          r2_key: string;
          public_url: string;
          file_type: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kit_id: string;
          tone: string;
          name: string;
          r2_key: string;
          public_url: string;
          file_type: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kit_audio_files"]["Insert"]>;
      };

      playlists: {
        Row: {
          id: string;
          name: string;
          slug: string;
          user_id: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          user_id?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["playlists"]["Insert"]>;
      };
      playlist_items: {
        Row: {
          id: string;
          playlist_id: string;
          kit_id: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          playlist_id: string;
          kit_id: string;
          position: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["playlist_items"]["Insert"]>;
      };
      kit_access_logs: {
        Row: {
          id: string;
          user_id: string;
          kit_id: string;
          accessed_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kit_id: string;
          accessed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kit_access_logs"]["Insert"]>;
      };
      kits: {
        Row: {
          id: string;
          name: string;
          slug: string;
          artist: string;
          category_id: string | null;
          description: string | null;
          lyrics: string | null;
          cover_url: string | null;
          r2_folder: string | null;
          required_plan: string | null;
          published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          artist: string;
          category_id?: string | null;
          description?: string | null;
          lyrics?: string | null;
          cover_url?: string | null;
          r2_folder?: string | null;
          required_plan?: string | null;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kits"]["Insert"]>;
      };
    };
  };
}
