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
          status: "active" | "canceled" | "expired" | "pending" | "abandoned";
          starts_at: string | null;
          current_period_end: string | null;
          trial_ends_at: string | null;
          auto_renew: boolean;
          gateway: string | null;
          gateway_customer_id: string | null;
          gateway_subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_id: string;
          legacy_pms_subscription_id?: string | null;
          status?: "active" | "canceled" | "expired" | "pending" | "abandoned";
          starts_at?: string | null;
          current_period_end?: string | null;
          trial_ends_at?: string | null;
          auto_renew?: boolean;
          gateway?: string | null;
          gateway_customer_id?: string | null;
          gateway_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
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
