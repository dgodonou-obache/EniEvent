/**
 * Types de la base Supabase.
 *
 * ⚠️ Fichier généré — ne pas éditer à la main.
 * Régénérer après chaque migration :  npm run db:types
 */

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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      amenities: {
        Row: {
          applies_to: Database["public"]["Enums"]["category_kind"] | null
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          applies_to?: Database["public"]["Enums"]["category_kind"] | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          applies_to?: Database["public"]["Enums"]["category_kind"] | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          from_state: string | null
          id: string
          metadata: Json
          to_state: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          from_state?: string | null
          id?: string
          metadata?: Json
          to_state?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          from_state?: string | null
          id?: string
          metadata?: Json
          to_state?: string | null
        }
        Relationships: []
      }
      availabilities: {
        Row: {
          capacity_used: number
          created_at: string
          date: string
          id: string
          inventory: number
          listing_id: string
          price: number | null
          slot: Database["public"]["Enums"]["availability_slot"]
          status: Database["public"]["Enums"]["availability_status"]
          updated_at: string
        }
        Insert: {
          capacity_used?: number
          created_at?: string
          date: string
          id?: string
          inventory?: number
          listing_id: string
          price?: number | null
          slot?: Database["public"]["Enums"]["availability_slot"]
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
        }
        Update: {
          capacity_used?: number
          created_at?: string
          date?: string
          id?: string
          inventory?: number
          listing_id?: string
          price?: number | null
          slot?: Database["public"]["Enums"]["availability_slot"]
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availabilities_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availabilities_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_policies: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          summary: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          summary: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          summary?: string
        }
        Relationships: []
      }
      cancellation_rules: {
        Row: {
          id: string
          min_days_before: number
          policy_id: string
          refund_percent: number
        }
        Insert: {
          id?: string
          min_days_before: number
          policy_id: string
          refund_percent: number
        }
        Update: {
          id?: string
          min_days_before?: number
          policy_id?: string
          refund_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_rules_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "cancellation_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          parent_id: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          parent_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name?: string
          parent_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_kind_fkey"
            columns: ["parent_id", "kind"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "kind"]
          },
        ]
      }
      cities: {
        Row: {
          country: string
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          region: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          region?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          region?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      cost_centers: {
        Row: {
          budget_amount: number | null
          code: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          period_end: string | null
          period_start: string | null
          updated_at: string
        }
        Insert: {
          budget_amount?: number | null
          code: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          period_end?: string | null
          period_start?: string | null
          updated_at?: string
        }
        Update: {
          budget_amount?: number | null
          code?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          period_end?: string | null
          period_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_documents: {
        Row: {
          created_at: string
          file_path: string
          id: string
          org_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          type: Database["public"]["Enums"]["kyc_document_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          org_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          type: Database["public"]["Enums"]["kyc_document_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          org_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          type?: Database["public"]["Enums"]["kyc_document_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_amenities: {
        Row: {
          amenity_id: string
          listing_id: string
        }
        Insert: {
          amenity_id: string
          listing_id: string
        }
        Update: {
          amenity_id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_amenities_amenity_id_fkey"
            columns: ["amenity_id"]
            isOneToOne: false
            referencedRelation: "amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_amenities_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_amenities_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_media: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          listing_id: string
          position: number
          storage_path: string
          type: Database["public"]["Enums"]["media_type"]
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          listing_id: string
          position?: number
          storage_path: string
          type?: Database["public"]["Enums"]["media_type"]
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          position?: number
          storage_path?: string
          type?: Database["public"]["Enums"]["media_type"]
        }
        Relationships: [
          {
            foreignKeyName: "listing_media_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_media_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_options: {
        Row: {
          description: string | null
          id: string
          is_required: boolean
          label: string
          listing_id: string
          max_quantity: number | null
          price: number
          sort_order: number
          unit: Database["public"]["Enums"]["price_unit"]
        }
        Insert: {
          description?: string | null
          id?: string
          is_required?: boolean
          label: string
          listing_id: string
          max_quantity?: number | null
          price: number
          sort_order?: number
          unit?: Database["public"]["Enums"]["price_unit"]
        }
        Update: {
          description?: string | null
          id?: string
          is_required?: boolean
          label?: string
          listing_id?: string
          max_quantity?: number | null
          price?: number
          sort_order?: number
          unit?: Database["public"]["Enums"]["price_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "listing_options_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_options_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          address: string | null
          booking_mode: Database["public"]["Enums"]["booking_mode"]
          cancellation_policy_id: string | null
          category_id: string
          city: string
          cover_url: string | null
          created_at: string
          currency: string
          description: string | null
          district: string | null
          highlights: string[]
          id: string
          is_paused: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          latitude: number | null
          longitude: number | null
          min_notice_days: number
          min_price: number | null
          moderation_notes: string | null
          org_id: string
          org_type: Database["public"]["Enums"]["org_type"]
          payment_terms: string | null
          price_from: number | null
          price_from_unit: Database["public"]["Enums"]["price_unit"] | null
          published_at: string | null
          rating_avg: number | null
          rating_count: number
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          booking_mode?: Database["public"]["Enums"]["booking_mode"]
          cancellation_policy_id?: string | null
          category_id: string
          city: string
          cover_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          district?: string | null
          highlights?: string[]
          id?: string
          is_paused?: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          latitude?: number | null
          longitude?: number | null
          min_notice_days?: number
          min_price?: number | null
          moderation_notes?: string | null
          org_id: string
          org_type?: Database["public"]["Enums"]["org_type"]
          payment_terms?: string | null
          price_from?: number | null
          price_from_unit?: Database["public"]["Enums"]["price_unit"] | null
          published_at?: string | null
          rating_avg?: number | null
          rating_count?: number
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          booking_mode?: Database["public"]["Enums"]["booking_mode"]
          cancellation_policy_id?: string | null
          category_id?: string
          city?: string
          cover_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          district?: string | null
          highlights?: string[]
          id?: string
          is_paused?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          latitude?: number | null
          longitude?: number | null
          min_notice_days?: number
          min_price?: number | null
          moderation_notes?: string | null
          org_id?: string
          org_type?: Database["public"]["Enums"]["org_type"]
          payment_terms?: string | null
          price_from?: number | null
          price_from_unit?: Database["public"]["Enums"]["price_unit"] | null
          published_at?: string | null
          rating_avg?: number | null
          rating_count?: number
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_cancellation_policy_id_fkey"
            columns: ["cancellation_policy_id"]
            isOneToOne: false
            referencedRelation: "cancellation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_category_id_kind_fkey"
            columns: ["category_id", "kind"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "kind"]
          },
          {
            foreignKeyName: "listings_org_id_org_type_fkey"
            columns: ["org_id", "org_type"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id", "type"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          org_id: string
          org_type: Database["public"]["Enums"]["org_type"]
          role: Database["public"]["Enums"]["org_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          org_id: string
          org_type: Database["public"]["Enums"]["org_type"]
          role: Database["public"]["Enums"]["org_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          org_id?: string
          org_type?: Database["public"]["Enums"]["org_type"]
          role?: Database["public"]["Enums"]["org_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_org_id_org_type_fkey"
            columns: ["org_id", "org_type"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id", "type"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          account_manager_id: string | null
          address: string | null
          billing_email: string | null
          brand_name: string | null
          city: string | null
          country: string
          created_at: string
          id: string
          ifu: string | null
          legal_name: string
          logo_url: string | null
          phone: string | null
          rccm: string | null
          slug: string | null
          status: Database["public"]["Enums"]["org_status"]
          type: Database["public"]["Enums"]["org_type"]
          updated_at: string
        }
        Insert: {
          account_manager_id?: string | null
          address?: string | null
          billing_email?: string | null
          brand_name?: string | null
          city?: string | null
          country?: string
          created_at?: string
          id?: string
          ifu?: string | null
          legal_name: string
          logo_url?: string | null
          phone?: string | null
          rccm?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["org_status"]
          type: Database["public"]["Enums"]["org_type"]
          updated_at?: string
        }
        Update: {
          account_manager_id?: string | null
          address?: string | null
          billing_email?: string | null
          brand_name?: string | null
          city?: string | null
          country?: string
          created_at?: string
          id?: string
          ifu?: string | null
          legal_name?: string
          logo_url?: string | null
          phone?: string | null
          rccm?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["org_status"]
          type?: Database["public"]["Enums"]["org_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_account_manager_id_fkey"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_profiles: {
        Row: {
          acceptance_rate: number | null
          bio: string | null
          commission_rate_override: number | null
          created_at: string
          is_verified: boolean
          org_id: string
          rating_avg: number | null
          rating_count: number
          response_time_avg_h: number | null
          service_cities: string[]
          travel_radius_km: number | null
          updated_at: string
          verified_at: string | null
          years_experience: number | null
        }
        Insert: {
          acceptance_rate?: number | null
          bio?: string | null
          commission_rate_override?: number | null
          created_at?: string
          is_verified?: boolean
          org_id: string
          rating_avg?: number | null
          rating_count?: number
          response_time_avg_h?: number | null
          service_cities?: string[]
          travel_radius_km?: number | null
          updated_at?: string
          verified_at?: string | null
          years_experience?: number | null
        }
        Update: {
          acceptance_rate?: number | null
          bio?: string | null
          commission_rate_override?: number | null
          created_at?: string
          is_verified?: boolean
          org_id?: string
          rating_avg?: number | null
          rating_count?: number
          response_time_avg_h?: number | null
          service_cities?: string[]
          travel_radius_km?: number | null
          updated_at?: string
          verified_at?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          base_price: number
          created_at: string
          id: string
          listing_id: string
          min_duration: number
          season_end: string | null
          season_start: string | null
          unit: Database["public"]["Enums"]["price_unit"]
          updated_at: string
          weekend_multiplier: number
        }
        Insert: {
          base_price: number
          created_at?: string
          id?: string
          listing_id: string
          min_duration?: number
          season_end?: string | null
          season_start?: string | null
          unit: Database["public"]["Enums"]["price_unit"]
          updated_at?: string
          weekend_multiplier?: number
        }
        Update: {
          base_price?: number
          created_at?: string
          id?: string
          listing_id?: string
          min_duration?: number
          season_end?: string | null
          season_start?: string | null
          unit?: Database["public"]["Enums"]["price_unit"]
          updated_at?: string
          weekend_multiplier?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string
          full_name: string | null
          id: string
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quote_lines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          label: string
          line_total: number | null
          position: number
          quantity: number
          quote_id: string
          unit: Database["public"]["Enums"]["price_unit"]
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          label: string
          line_total?: number | null
          position?: number
          quantity?: number
          quote_id: string
          unit?: Database["public"]["Enums"]["price_unit"]
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          line_total?: number | null
          position?: number
          quantity?: number
          quote_id?: string
          unit?: Database["public"]["Enums"]["price_unit"]
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_request_items: {
        Row: {
          awarded_quote_id: string | null
          budget_max: number | null
          category_id: string
          created_at: string
          id: string
          listing_id: string | null
          notes: string | null
          quantity: number
          request_id: string
        }
        Insert: {
          awarded_quote_id?: string | null
          budget_max?: number | null
          category_id: string
          created_at?: string
          id?: string
          listing_id?: string | null
          notes?: string | null
          quantity?: number
          request_id: string
        }
        Update: {
          awarded_quote_id?: string | null
          budget_max?: number | null
          category_id?: string
          created_at?: string
          id?: string
          listing_id?: string | null
          notes?: string | null
          quantity?: number
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_request_items_awarded_quote_fkey"
            columns: ["awarded_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_request_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_request_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_request_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          city: string
          contact_phone: string | null
          created_at: string
          currency: string
          description: string | null
          district: string | null
          event_date: string | null
          event_end_date: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          guests: number | null
          id: string
          is_date_flexible: boolean
          org_id: string | null
          published_at: string | null
          reference: string
          requester_id: string
          respond_by: string | null
          status: Database["public"]["Enums"]["quote_request_status"]
          title: string
          updated_at: string
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          city: string
          contact_phone?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          district?: string | null
          event_date?: string | null
          event_end_date?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          guests?: number | null
          id?: string
          is_date_flexible?: boolean
          org_id?: string | null
          published_at?: string | null
          reference?: string
          requester_id: string
          respond_by?: string | null
          status?: Database["public"]["Enums"]["quote_request_status"]
          title: string
          updated_at?: string
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          city?: string
          contact_phone?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          district?: string | null
          event_date?: string | null
          event_end_date?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          guests?: number | null
          id?: string
          is_date_flexible?: boolean
          org_id?: string | null
          published_at?: string | null
          reference?: string
          requester_id?: string
          respond_by?: string | null
          status?: Database["public"]["Enums"]["quote_request_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          currency: string
          decided_at: string | null
          decline_reason: string | null
          id: string
          item_id: string
          listing_id: string | null
          message: string | null
          org_id: string
          org_type: Database["public"]["Enums"]["org_type"]
          reference: string
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          decided_at?: string | null
          decline_reason?: string | null
          id?: string
          item_id: string
          listing_id?: string | null
          message?: string | null
          org_id: string
          org_type?: Database["public"]["Enums"]["org_type"]
          reference?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          decided_at?: string | null
          decline_reason?: string | null
          id?: string
          item_id?: string
          listing_id?: string | null
          message?: string | null
          org_id?: string
          org_type?: Database["public"]["Enums"]["org_type"]
          reference?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "quote_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_org_id_org_type_fkey"
            columns: ["org_id", "org_type"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id", "type"]
          },
        ]
      }
      service_details: {
        Row: {
          attributes: Json
          created_at: string
          listing_id: string
          max_guests: number | null
          min_guests: number | null
          setup_time_min: number | null
          teardown_time_min: number | null
          travel_fee_per_km: number | null
          travel_radius_km: number | null
          updated_at: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          listing_id: string
          max_guests?: number | null
          min_guests?: number | null
          setup_time_min?: number | null
          teardown_time_min?: number | null
          travel_fee_per_km?: number | null
          travel_radius_km?: number | null
          updated_at?: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          listing_id?: string
          max_guests?: number | null
          min_guests?: number | null
          setup_time_min?: number | null
          teardown_time_min?: number | null
          travel_fee_per_km?: number | null
          travel_radius_km?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_details: {
        Row: {
          accessibility_pmr: boolean
          alcohol_allowed: boolean
          capacity_cocktail: number | null
          capacity_seated: number | null
          capacity_standing: number | null
          created_at: string
          external_caterer_allowed: boolean
          has_kitchen: boolean
          has_outdoor_space: boolean
          layouts: string[]
          listing_id: string
          noise_curfew_hour: number | null
          parking_spots: number | null
          surface_m2: number | null
          updated_at: string
        }
        Insert: {
          accessibility_pmr?: boolean
          alcohol_allowed?: boolean
          capacity_cocktail?: number | null
          capacity_seated?: number | null
          capacity_standing?: number | null
          created_at?: string
          external_caterer_allowed?: boolean
          has_kitchen?: boolean
          has_outdoor_space?: boolean
          layouts?: string[]
          listing_id: string
          noise_curfew_hour?: number | null
          parking_spots?: number | null
          surface_m2?: number | null
          updated_at?: string
        }
        Update: {
          accessibility_pmr?: boolean
          alcohol_allowed?: boolean
          capacity_cocktail?: number | null
          capacity_seated?: number | null
          capacity_standing?: number | null
          created_at?: string
          external_caterer_allowed?: boolean
          has_kitchen?: boolean
          has_outdoor_space?: boolean
          layouts?: string[]
          listing_id?: string
          noise_curfew_hour?: number | null
          parking_spots?: number | null
          surface_m2?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_spaces: {
        Row: {
          base_price: number | null
          capacity: number | null
          id: string
          listing_id: string
          name: string
          sort_order: number
          surface_m2: number | null
        }
        Insert: {
          base_price?: number | null
          capacity?: number | null
          id?: string
          listing_id: string
          name: string
          sort_order?: number
          surface_m2?: number | null
        }
        Update: {
          base_price?: number | null
          capacity?: number | null
          id?: string
          listing_id?: string
          name?: string
          sort_order?: number
          surface_m2?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_spaces_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_spaces_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      listing_search: {
        Row: {
          amenity_slugs: string[] | null
          booking_mode: Database["public"]["Enums"]["booking_mode"] | null
          capacity_seated: number | null
          capacity_standing: number | null
          category_name: string | null
          category_slug: string | null
          city: string | null
          cover_url: string | null
          currency: string | null
          description: string | null
          district: string | null
          family_name: string | null
          family_slug: string | null
          id: string | null
          is_paused: boolean | null
          kind: Database["public"]["Enums"]["category_kind"] | null
          latitude: number | null
          longitude: number | null
          max_capacity: number | null
          min_guests: number | null
          min_price: number | null
          org_id: string | null
          org_name: string | null
          org_slug: string | null
          org_status: Database["public"]["Enums"]["org_status"] | null
          org_verified: boolean | null
          price_from: number | null
          price_from_unit: Database["public"]["Enums"]["price_unit"] | null
          published_at: string | null
          rating_avg: number | null
          rating_count: number | null
          search_text: string | null
          slug: string | null
          status: Database["public"]["Enums"]["listing_status"] | null
          surface_m2: number | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_quote: { Args: { target: string }; Returns: undefined }
      next_reference: { Args: { prefix: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      account_type: "particulier" | "entreprise" | "partenaire" | "admin"
      availability_slot: "journee" | "matin" | "apres_midi" | "soiree"
      availability_status: "open" | "closed" | "booked"
      booking_mode: "instant" | "quote" | "both"
      category_kind: "venue" | "service"
      event_type:
        | "mariage"
        | "anniversaire"
        | "bapteme"
        | "seminaire"
        | "conference"
        | "lancement"
        | "ceremonie"
        | "funerailles"
        | "autre"
      kyc_document_type:
        | "id_card"
        | "rccm"
        | "ifu"
        | "bank_details"
        | "insurance"
      kyc_status: "pending" | "approved" | "rejected"
      listing_status: "draft" | "pending" | "approved" | "rejected" | "archived"
      media_type: "image" | "video"
      member_status: "invited" | "active" | "revoked"
      org_role:
        | "owner"
        | "admin"
        | "organizer"
        | "approver"
        | "finance"
        | "viewer"
        | "manager"
        | "staff"
        | "accountant"
      org_status: "pending" | "active" | "suspended"
      org_type: "company" | "partner"
      price_unit:
        | "day"
        | "half_day"
        | "hour"
        | "person"
        | "item"
        | "square_meter"
        | "forfait"
      quote_request_status:
        | "draft"
        | "open"
        | "closed"
        | "awarded"
        | "cancelled"
        | "expired"
      quote_status:
        | "draft"
        | "sent"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "expired"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["particulier", "entreprise", "partenaire", "admin"],
      availability_slot: ["journee", "matin", "apres_midi", "soiree"],
      availability_status: ["open", "closed", "booked"],
      booking_mode: ["instant", "quote", "both"],
      category_kind: ["venue", "service"],
      event_type: [
        "mariage",
        "anniversaire",
        "bapteme",
        "seminaire",
        "conference",
        "lancement",
        "ceremonie",
        "funerailles",
        "autre",
      ],
      kyc_document_type: [
        "id_card",
        "rccm",
        "ifu",
        "bank_details",
        "insurance",
      ],
      kyc_status: ["pending", "approved", "rejected"],
      listing_status: ["draft", "pending", "approved", "rejected", "archived"],
      media_type: ["image", "video"],
      member_status: ["invited", "active", "revoked"],
      org_role: [
        "owner",
        "admin",
        "organizer",
        "approver",
        "finance",
        "viewer",
        "manager",
        "staff",
        "accountant",
      ],
      org_status: ["pending", "active", "suspended"],
      org_type: ["company", "partner"],
      price_unit: [
        "day",
        "half_day",
        "hour",
        "person",
        "item",
        "square_meter",
        "forfait",
      ],
      quote_request_status: [
        "draft",
        "open",
        "closed",
        "awarded",
        "cancelled",
        "expired",
      ],
      quote_status: [
        "draft",
        "sent",
        "accepted",
        "declined",
        "withdrawn",
        "expired",
      ],
    },
  },
} as const
