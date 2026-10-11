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
      approvals: {
        Row: {
          amount: number | null
          cost_center_id: string | null
          created_at: string
          currency: string
          decided_at: string | null
          decided_by: string | null
          id: string
          org_id: string
          reason: string | null
          requested_by: string
          status: Database["public"]["Enums"]["approval_status"]
          subject: Database["public"]["Enums"]["approval_subject"]
          subject_id: string
        }
        Insert: {
          amount?: number | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          org_id: string
          reason?: string | null
          requested_by: string
          status?: Database["public"]["Enums"]["approval_status"]
          subject: Database["public"]["Enums"]["approval_subject"]
          subject_id: string
        }
        Update: {
          amount?: number | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          org_id?: string
          reason?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["approval_status"]
          subject?: Database["public"]["Enums"]["approval_subject"]
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "company_budget_usage"
            referencedColumns: ["cost_center_id"]
          },
          {
            foreignKeyName: "approvals_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
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
          entity_id?: string | null
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
          entity_id?: string | null
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
          {
            foreignKeyName: "availabilities_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
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
      company_settings: {
        Row: {
          approval_threshold: number | null
          approve_publication: boolean
          created_at: string
          currency: string
          org_id: string
          updated_at: string
        }
        Insert: {
          approval_threshold?: number | null
          approve_publication?: boolean
          created_at?: string
          currency?: string
          org_id: string
          updated_at?: string
        }
        Update: {
          approval_threshold?: number | null
          approve_publication?: boolean
          created_at?: string
          currency?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
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
          client_id: string
          client_org_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          listing_id: string | null
          org_id: string
          reference: string
          request_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          client_org_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          org_id: string
          reference?: string
          request_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_org_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          org_id?: string
          reference?: string
          request_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_client_org_id_fkey"
            columns: ["client_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
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
      disputes: {
        Row: {
          created_at: string
          id: string
          opened_by: string
          order_id: string
          reason: string
          reference: string
          refund_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          side: string
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          opened_by: string
          order_id: string
          reason: string
          reference?: string
          refund_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          side: string
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          opened_by?: string
          order_id?: string
          reason?: string
          reference?: string
          refund_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          side?: string
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string
          enabled: boolean
          key: string
          label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description: string
          enabled?: boolean
          key: string
          label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string
          enabled?: boolean
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          {
            foreignKeyName: "listing_amenities_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
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
          {
            foreignKeyName: "listing_media_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
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
          {
            foreignKeyName: "listing_options_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          address: string | null
          booking_mode: Database["public"]["Enums"]["booking_mode"]
          cancellation_policy_id: string
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
          cancellation_policy_id: string
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
          cancellation_policy_id?: string
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
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
          sender_side: Database["public"]["Enums"]["message_side"]
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
          sender_side: Database["public"]["Enums"]["message_side"]
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
          sender_side?: Database["public"]["Enums"]["message_side"]
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
          attempts: number
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          kind: string
          last_error: string | null
          payload: Json
          recipient: string
          ref_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          target_org_id: string | null
        }
        Insert: {
          attempts?: number
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          payload?: Json
          recipient: string
          ref_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          target_org_id?: string | null
        }
        Update: {
          attempts?: number
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json
          recipient?: string
          ref_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          target_org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_instalments: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          id: string
          label: string
          order_id: string
          position: number
        }
        Insert: {
          amount: number
          created_at?: string
          due_date?: string | null
          id?: string
          label: string
          order_id: string
          position: number
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          label?: string
          order_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_instalments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancel_reason: string | null
          cancellation_policy_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string
          commission_rate: number
          created_at: string
          currency: string
          end_date: string | null
          event_date: string | null
          id: string
          listing_id: string | null
          listing_title: string | null
          org_id: string
          paid_at: string | null
          quote_id: string | null
          reference: string
          request_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["order_status"]
          total: number
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancellation_policy_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id: string
          commission_rate: number
          created_at?: string
          currency?: string
          end_date?: string | null
          event_date?: string | null
          id?: string
          listing_id?: string | null
          listing_title?: string | null
          org_id: string
          paid_at?: string | null
          quote_id?: string | null
          reference?: string
          request_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total: number
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancellation_policy_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string
          commission_rate?: number
          created_at?: string
          currency?: string
          end_date?: string | null
          event_date?: string | null
          id?: string
          listing_id?: string | null
          listing_title?: string | null
          org_id?: string
          paid_at?: string | null
          quote_id?: string | null
          reference?: string
          request_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_cancellation_policy_id_fkey"
            columns: ["cancellation_policy_id"]
            isOneToOne: false
            referencedRelation: "cancellation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: true
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
      payment_schedules: {
        Row: {
          amount_kind: Database["public"]["Enums"]["schedule_amount"]
          created_at: string
          days_before: number | null
          fixed_amount: number | null
          id: string
          label: string
          org_id: string
          percent: number | null
          position: number
          trigger: Database["public"]["Enums"]["schedule_trigger"]
          updated_at: string
        }
        Insert: {
          amount_kind: Database["public"]["Enums"]["schedule_amount"]
          created_at?: string
          days_before?: number | null
          fixed_amount?: number | null
          id?: string
          label: string
          org_id: string
          percent?: number | null
          position: number
          trigger: Database["public"]["Enums"]["schedule_trigger"]
          updated_at?: string
        }
        Update: {
          amount_kind?: Database["public"]["Enums"]["schedule_amount"]
          created_at?: string
          days_before?: number | null
          fixed_amount?: number | null
          id?: string
          label?: string
          org_id?: string
          percent?: number | null
          position?: number
          trigger?: Database["public"]["Enums"]["schedule_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          commission: number
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          instalment_id: string
          last_error: string | null
          order_id: string
          paid_at: string | null
          partner_due: number
          payload: Json
          payout_id: string | null
          provider: string
          provider_ref: string | null
          provider_status: string | null
          reference: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          commission: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key: string
          instalment_id: string
          last_error?: string | null
          order_id: string
          paid_at?: string | null
          partner_due: number
          payload?: Json
          payout_id?: string | null
          provider?: string
          provider_ref?: string | null
          provider_status?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          commission?: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          instalment_id?: string
          last_error?: string | null
          order_id?: string
          paid_at?: string | null
          partner_due?: number
          payload?: Json
          payout_id?: string | null
          provider?: string
          provider_ref?: string | null
          provider_status?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_instalment_id_fkey"
            columns: ["instalment_id"]
            isOneToOne: false
            referencedRelation: "order_instalments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_accounts: {
        Row: {
          bank_details: string | null
          created_at: string
          holder_name: string
          method: Database["public"]["Enums"]["payout_method"]
          org_id: string
          phone: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          bank_details?: string | null
          created_at?: string
          holder_name: string
          method?: Database["public"]["Enums"]["payout_method"]
          org_id: string
          phone?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          bank_details?: string | null
          created_at?: string
          holder_name?: string
          method?: Database["public"]["Enums"]["payout_method"]
          org_id?: string
          phone?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          holder_name: string
          id: string
          method: Database["public"]["Enums"]["payout_method"]
          note: string | null
          org_id: string
          phone: string | null
          provider_ref: string | null
          reference: string
          sent_at: string | null
          status: Database["public"]["Enums"]["payout_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          holder_name: string
          id?: string
          method: Database["public"]["Enums"]["payout_method"]
          note?: string | null
          org_id: string
          phone?: string | null
          provider_ref?: string | null
          reference?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          holder_name?: string
          id?: string
          method?: Database["public"]["Enums"]["payout_method"]
          note?: string | null
          org_id?: string
          phone?: string | null
          provider_ref?: string | null
          reference?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
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
          {
            foreignKeyName: "pricing_rules_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
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
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
            foreignKeyName: "quote_request_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
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
          cost_center_id: string | null
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
          cost_center_id?: string | null
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
          cost_center_id?: string | null
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
            foreignKeyName: "quote_requests_cost_center_fkey"
            columns: ["cost_center_id", "org_id"]
            isOneToOne: false
            referencedRelation: "company_budget_usage"
            referencedColumns: ["cost_center_id", "org_id"]
          },
          {
            foreignKeyName: "quote_requests_cost_center_fkey"
            columns: ["cost_center_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id", "org_id"]
          },
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
            foreignKeyName: "quotes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
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
      refund_lines: {
        Row: {
          amount: number
          commission: number
          created_at: string
          id: string
          partner_due: number
          payment_id: string
          refund_id: string
          was_paid_out: boolean
        }
        Insert: {
          amount: number
          commission: number
          created_at?: string
          id?: string
          partner_due: number
          payment_id: string
          refund_id: string
          was_paid_out?: boolean
        }
        Update: {
          amount?: number
          commission?: number
          created_at?: string
          id?: string
          partner_due?: number
          payment_id?: string
          refund_id?: string
          was_paid_out?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "refund_lines_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_lines_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          currency: string
          id: string
          needs_recovery: boolean
          note: string | null
          order_id: string
          org_id: string
          policy_id: string | null
          provider_ref: string | null
          reason: string | null
          reference: string
          refund_percent: number
          requested_by: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          currency?: string
          id?: string
          needs_recovery?: boolean
          note?: string | null
          order_id: string
          org_id: string
          policy_id?: string | null
          provider_ref?: string | null
          reason?: string | null
          reference?: string
          refund_percent: number
          requested_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          currency?: string
          id?: string
          needs_recovery?: boolean
          note?: string | null
          order_id?: string
          org_id?: string
          policy_id?: string | null
          provider_ref?: string | null
          reason?: string | null
          reference?: string
          refund_percent?: number
          requested_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "cancellation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          id: string
          listing_id: string | null
          reason: string
          reference: string
          reporter_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_id: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_type: Database["public"]["Enums"]["report_target"]
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id?: string | null
          reason: string
          reference?: string
          reporter_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_type: Database["public"]["Enums"]["report_target"]
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string | null
          reason?: string
          reference?: string
          reporter_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_type?: Database["public"]["Enums"]["report_target"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string
          author_label: string
          body: string | null
          body_redacted_at: string | null
          created_at: string
          id: string
          listing_id: string | null
          order_id: string
          org_id: string
          rating: number
          redacted_by: string | null
          redaction_reason: string | null
          replied_at: string | null
          reply: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          author_label: string
          body?: string | null
          body_redacted_at?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          order_id: string
          org_id: string
          rating: number
          redacted_by?: string | null
          redaction_reason?: string | null
          replied_at?: string | null
          reply?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_label?: string
          body?: string | null
          body_redacted_at?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          order_id?: string
          org_id?: string
          rating?: number
          redacted_by?: string | null
          redaction_reason?: string | null
          replied_at?: string | null
          reply?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_hidden_by_fkey"
            columns: ["redacted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
          {
            foreignKeyName: "service_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings_bookable_now"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          body: string
          created_at: string
          id: string
          org_id: string | null
          reply_to: string
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          org_id?: string | null
          reply_to: string
          status?: string
          subject: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          org_id?: string | null
          reply_to?: string
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          {
            foreignKeyName: "venue_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings_bookable_now"
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
          {
            foreignKeyName: "venue_spaces_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings_bookable_now"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      category_live_counts: {
        Row: {
          category_name: string | null
          category_slug: string | null
          family_slug: string | null
          listings: number | null
        }
        Relationships: []
      }
      company_budget_usage: {
        Row: {
          budget_amount: number | null
          code: string | null
          committed: number | null
          cost_center_id: string | null
          currency: string | null
          is_active: boolean | null
          name: string | null
          org_id: string | null
          period_end: string | null
          period_start: string | null
          remaining: number | null
          request_count: number | null
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
          rating_sort: number | null
          search_text: string | null
          slug: string | null
          status: Database["public"]["Enums"]["listing_status"] | null
          surface_m2: number | null
          title: string | null
        }
        Relationships: []
      }
      listings_bookable_now: {
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
          dates_ouvertes: number | null
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
          prochaine_date: string | null
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
      accept_invitation: {
        Args: { jeton: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "organization_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      accept_quote: { Args: { target: string }; Returns: undefined }
      account_deletion_blockers: {
        Args: never
        Returns: {
          code: string
          reason: string
        }[]
      }
      admin_companies: {
        Args: never
        Returns: {
          billing_email: string
          brand_name: string
          city: string
          created_at: string
          legal_name: string
          member_count: number
          org_id: string
          phone: string
          status: Database["public"]["Enums"]["org_status"]
        }[]
      }
      admin_disputes: {
        Args: { etat?: string }
        Returns: {
          client_label: string
          created_at: string
          event_date: string
          id: string
          listing_title: string
          order_currency: string
          order_id: string
          order_reference: string
          order_status: Database["public"]["Enums"]["order_status"]
          order_total: number
          org_id: string
          org_name: string
          paid_amount: number
          reason: string
          reference: string
          refund_amount: number
          refund_id: string
          refund_reference: string
          resolution: string
          side: string
          status: Database["public"]["Enums"]["dispute_status"]
        }[]
      }
      admin_reports: {
        Args: { etat?: string }
        Returns: {
          created_at: string
          id: string
          listing_id: string
          listing_title: string
          org_name: string
          reason: string
          reference: string
          reporter_is_party: boolean
          reporter_label: string
          resolution: string
          review_author: string
          review_body: string
          review_body_redacted_at: string
          review_id: string
          review_rating: number
          status: Database["public"]["Enums"]["report_status"]
          target_type: Database["public"]["Enums"]["report_target"]
        }[]
      }
      admin_reviews: {
        Args: { etat?: string }
        Returns: {
          author_label: string
          body: string
          body_redacted_at: string
          created_at: string
          id: string
          listing_id: string
          listing_title: string
          order_reference: string
          org_id: string
          org_name: string
          rating: number
          redaction_reason: string
          replied_at: string
          reply: string
        }[]
      }
      admin_users: {
        Args: { decalage?: number; limite?: number; recherche?: string }
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          created_at: string
          email: string
          email_confirmed: boolean
          full_name: string
          id: string
          last_sign_in_at: string
          org_count: number
          phone: string
        }[]
      }
      attach_payment_reference: {
        Args: { adresse?: string; cle: string; ref: string }
        Returns: undefined
      }
      book_listing: {
        Args: { annonce: string; jours: string[] }
        Returns: {
          cancel_reason: string | null
          cancellation_policy_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string
          commission_rate: number
          created_at: string
          currency: string
          end_date: string | null
          event_date: string | null
          id: string
          listing_id: string | null
          listing_title: string | null
          org_id: string
          paid_at: string | null
          quote_id: string | null
          reference: string
          request_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["order_status"]
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_order: {
        Args: { cible: string; motif?: string }
        Returns: Database["public"]["CompositeTypes"]["cancellation_outcome"]
        SetofOptions: {
          from: "*"
          to: "cancellation_outcome"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_payout: {
        Args: { cible: string; motif?: string }
        Returns: {
          amount: number
          created_at: string
          currency: string
          holder_name: string
          id: string
          method: Database["public"]["Enums"]["payout_method"]
          note: string | null
          org_id: string
          phone: string | null
          provider_ref: string | null
          reference: string
          sent_at: string | null
          status: Database["public"]["Enums"]["payout_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_notifications: {
        Args: { batch?: number }
        Returns: {
          attempts: number
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          kind: string
          last_error: string | null
          payload: Json
          recipient: string
          ref_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          target_org_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      commission_settings: {
        Args: never
        Returns: {
          city: string
          effective_rate: number
          is_verified: boolean
          listings_count: number
          org_id: string
          org_name: string
          rate_override: number
          status: Database["public"]["Enums"]["org_status"]
        }[]
      }
      create_payout: {
        Args: { org: string }
        Returns: {
          amount: number
          created_at: string
          currency: string
          holder_name: string
          id: string
          method: Database["public"]["Enums"]["payout_method"]
          note: string | null
          org_id: string
          phone: string | null
          provider_ref: string | null
          reference: string
          sent_at: string | null
          status: Database["public"]["Enums"]["payout_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_approval: {
        Args: { p_approve: boolean; p_reason?: string; target: string }
        Returns: undefined
      }
      default_commission_rate: { Args: never; Returns: number }
      delete_my_account: { Args: never; Returns: string }
      enqueue_deadline_reminders: {
        Args: { fenetre?: string }
        Returns: number
      }
      invitation_preview: {
        Args: { jeton: string }
        Returns: {
          already_accepted: boolean
          email: string
          expired: boolean
          org_name: string
          org_type: Database["public"]["Enums"]["org_type"]
          role: Database["public"]["Enums"]["org_role"]
        }[]
      }
      invite_member: {
        Args: {
          adresse: string
          org: string
          role_demande: Database["public"]["Enums"]["org_role"]
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          token: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_notification: {
        Args: { delivered: boolean; detail?: string; target: string }
        Returns: undefined
      }
      mark_payout_sent: {
        Args: { cible: string; commentaire?: string; ref: string }
        Returns: {
          amount: number
          created_at: string
          currency: string
          holder_name: string
          id: string
          method: Database["public"]["Enums"]["payout_method"]
          note: string | null
          org_id: string
          phone: string | null
          provider_ref: string | null
          reference: string
          sent_at: string | null
          status: Database["public"]["Enums"]["payout_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_refund_sent: {
        Args: { cible: string; commentaire?: string; ref: string }
        Returns: {
          amount: number
          client_id: string
          created_at: string
          currency: string
          id: string
          needs_recovery: boolean
          note: string | null
          order_id: string
          org_id: string
          policy_id: string | null
          provider_ref: string | null
          reason: string | null
          reference: string
          refund_percent: number
          requested_by: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_conversations: {
        Args: never
        Returns: {
          counterpart: string
          id: string
          last_message_at: string
          listing_id: string
          listing_title: string
          reference: string
          request_id: string
          request_reference: string
          side: Database["public"]["Enums"]["message_side"]
          unmasked: boolean
          unread: number
        }[]
      }
      next_reference: { Args: { prefix: string }; Returns: string }
      open_conversation: {
        Args: { annonce?: string; demande?: string; org: string }
        Returns: {
          client_id: string
          client_org_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          listing_id: string | null
          org_id: string
          reference: string
          request_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_conversation_for_request: {
        Args: { demande: string; mon_org: string }
        Returns: {
          client_id: string
          client_org_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          listing_id: string | null
          org_id: string
          reference: string
          request_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_dispute: {
        Args: { commande: string; motif: string }
        Returns: string
      }
      open_report: {
        Args: {
          cible: string
          genre: Database["public"]["Enums"]["report_target"]
          motif: string
        }
        Returns: string
      }
      org_contact: {
        Args: { org: string }
        Returns: {
          billing_email: string
          ifu: string
          phone: string
          rccm: string
        }[]
      }
      payout_candidates: {
        Args: never
        Returns: {
          currency: string
          held: number
          org_id: string
          org_name: string
          payable: number
        }[]
      }
      pending_payout_amount: {
        Args: { org: string }
        Returns: {
          held: number
          payable: number
        }[]
      }
      read_conversation: {
        Args: { conversation: string }
        Returns: {
          body: string
          created_at: string
          id: string
          mine: boolean
          sender_side: Database["public"]["Enums"]["message_side"]
        }[]
      }
      redact_review_body: {
        Args: { avis: string; motif: string }
        Returns: undefined
      }
      release_stale_orders: { Args: { delai?: string }; Returns: number }
      reply_to_review: {
        Args: { avis: string; texte: string }
        Returns: undefined
      }
      request_contact: {
        Args: { demande: string }
        Returns: {
          contact_phone: string
        }[]
      }
      request_publication_approval: {
        Args: { target: string }
        Returns: string
      }
      request_quote_approval: { Args: { target: string }; Returns: string }
      resolve_dispute: {
        Args: {
          issue: Database["public"]["Enums"]["dispute_status"]
          litige: string
          note: string
          remboursement?: string
        }
        Returns: undefined
      }
      resolve_report: {
        Args: {
          issue: Database["public"]["Enums"]["report_status"]
          note?: string
          signalement: string
        }
        Returns: undefined
      }
      restore_review_body: { Args: { avis: string }; Returns: undefined }
      save_payment_schedule: {
        Args: { lignes: Json; org: string }
        Returns: {
          amount_kind: Database["public"]["Enums"]["schedule_amount"]
          created_at: string
          days_before: number | null
          fixed_amount: number | null
          id: string
          label: string
          org_id: string
          percent: number | null
          position: number
          trigger: Database["public"]["Enums"]["schedule_trigger"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_schedules"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      save_payout_account: {
        Args: {
          banque?: string
          moyen: Database["public"]["Enums"]["payout_method"]
          numero: string
          org: string
          titulaire: string
        }
        Returns: {
          bank_details: string | null
          created_at: string
          holder_name: string
          method: Database["public"]["Enums"]["payout_method"]
          org_id: string
          phone: string | null
          updated_at: string
          verified_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payout_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_message: {
        Args: { conversation: string; corps: string }
        Returns: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
          sender_side: Database["public"]["Enums"]["message_side"]
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_account_type: {
        Args: {
          cible: string
          nouveau: Database["public"]["Enums"]["account_type"]
        }
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string
          deleted_at: string | null
          full_name: string | null
          id: string
          locale: string
          phone: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_commission_rate: {
        Args: { org: string; taux?: number }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "partner_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_default_commission_rate: { Args: { taux: number }; Returns: number }
      set_feature_flag: {
        Args: { actif: boolean; cle: string }
        Returns: {
          description: string
          enabled: boolean
          key: string
          label: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "feature_flags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_org_status: {
        Args: {
          nouveau: Database["public"]["Enums"]["org_status"]
          org: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      settle_payment: {
        Args: {
          cle: string
          detail?: string
          encaisse: boolean
          etat_prestataire: string
          montant_constate?: number
          ref_prestataire: string
        }
        Returns: {
          amount: number
          commission: number
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          instalment_id: string
          last_error: string | null
          order_id: string
          paid_at: string | null
          partner_due: number
          payload: Json
          payout_id: string | null
          provider: string
          provider_ref: string | null
          provider_status: string | null
          reference: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_payment: {
        Args: { cle: string; echeance: string }
        Returns: {
          amount: number
          commission: number
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          instalment_id: string
          last_error: string | null
          order_id: string
          paid_at: string | null
          partner_due: number
          payload: Json
          payout_id: string | null
          provider: string
          provider_ref: string | null
          provider_status: string | null
          reference: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      withdraw_dispute: {
        Args: { litige: string; note?: string }
        Returns: undefined
      }
    }
    Enums: {
      account_type: "particulier" | "entreprise" | "partenaire" | "admin"
      approval_status: "pending" | "approved" | "rejected" | "cancelled"
      approval_subject: "quote_request" | "quote"
      availability_slot: "journee" | "matin" | "apres_midi" | "soiree"
      availability_status: "open" | "closed" | "booked"
      booking_mode: "instant" | "quote" | "both"
      category_kind: "venue" | "service"
      dispute_status:
        | "open"
        | "under_review"
        | "resolved_refund"
        | "resolved_partner"
        | "withdrawn"
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
      message_side: "client" | "partner"
      notification_channel: "sms" | "email"
      notification_status: "pending" | "sending" | "sent" | "failed"
      order_status:
        | "pending_payment"
        | "deposit_paid"
        | "paid"
        | "cancelled"
        | "refunded"
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
      payment_status: "pending" | "paid" | "failed" | "cancelled" | "refunded"
      payout_method: "mtn" | "moov" | "celtiis" | "virement"
      payout_status: "pending" | "sent" | "failed" | "cancelled"
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
        | "pending_approval"
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
      refund_status: "pending" | "sent" | "failed" | "cancelled"
      report_status: "open" | "upheld" | "dismissed"
      report_target: "review" | "listing"
      schedule_amount: "percent" | "fixed" | "balance"
      schedule_trigger: "booking" | "before_event"
    }
    CompositeTypes: {
      cancellation_outcome: {
        order_id: string | null
        status: Database["public"]["Enums"]["order_status"] | null
        refund_percent: number | null
        paid: number | null
        retained: number | null
        refunded: number | null
        refund_id: string | null
        needs_recovery: boolean | null
      }
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
      approval_status: ["pending", "approved", "rejected", "cancelled"],
      approval_subject: ["quote_request", "quote"],
      availability_slot: ["journee", "matin", "apres_midi", "soiree"],
      availability_status: ["open", "closed", "booked"],
      booking_mode: ["instant", "quote", "both"],
      category_kind: ["venue", "service"],
      dispute_status: [
        "open",
        "under_review",
        "resolved_refund",
        "resolved_partner",
        "withdrawn",
      ],
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
      message_side: ["client", "partner"],
      notification_channel: ["sms", "email"],
      notification_status: ["pending", "sending", "sent", "failed"],
      order_status: [
        "pending_payment",
        "deposit_paid",
        "paid",
        "cancelled",
        "refunded",
      ],
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
      payment_status: ["pending", "paid", "failed", "cancelled", "refunded"],
      payout_method: ["mtn", "moov", "celtiis", "virement"],
      payout_status: ["pending", "sent", "failed", "cancelled"],
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
        "pending_approval",
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
      refund_status: ["pending", "sent", "failed", "cancelled"],
      report_status: ["open", "upheld", "dismissed"],
      report_target: ["review", "listing"],
      schedule_amount: ["percent", "fixed", "balance"],
      schedule_trigger: ["booking", "before_event"],
    },
  },
} as const
