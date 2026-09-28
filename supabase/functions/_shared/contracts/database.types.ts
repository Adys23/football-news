export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      article_entities: {
        Row: {
          article_id: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          role: string
        }
        Insert: {
          article_id: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          role?: string
        }
        Update: {
          article_id?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_entities_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_redirects: {
        Row: {
          article_id: string
          created_at: string
          old_slug: string
        }
        Insert: {
          article_id: string
          created_at?: string
          old_slug: string
        }
        Update: {
          article_id?: string
          created_at?: string
          old_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_redirects_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_revisions: {
        Row: {
          article_id: string
          content: Json | null
          created_at: string
          edited_by: string | null
          id: string
          lead: string | null
          title: string | null
        }
        Insert: {
          article_id: string
          content?: Json | null
          created_at?: string
          edited_by?: string | null
          id?: string
          lead?: string | null
          title?: string | null
        }
        Update: {
          article_id?: string
          content?: Json | null
          created_at?: string
          edited_by?: string | null
          id?: string
          lead?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_revisions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_revisions_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_scores: {
        Row: {
          article_id: string
          checked_at: string
          clickbait: number | null
          factual_accuracy: number | null
          issues: Json
          model_used: string | null
          originality: number | null
          prompt_version: string | null
          quality: number | null
          seo: number | null
          unsupported_claims: number
        }
        Insert: {
          article_id: string
          checked_at?: string
          clickbait?: number | null
          factual_accuracy?: number | null
          issues?: Json
          model_used?: string | null
          originality?: number | null
          prompt_version?: string | null
          quality?: number | null
          seo?: number | null
          unsupported_claims?: number
        }
        Update: {
          article_id?: string
          checked_at?: string
          clickbait?: number | null
          factual_accuracy?: number | null
          issues?: Json
          model_used?: string | null
          originality?: number | null
          prompt_version?: string | null
          quality?: number | null
          seo?: number | null
          unsupported_claims?: number
        }
        Relationships: [
          {
            foreignKeyName: "article_scores_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: true
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_updates: {
        Row: {
          approved_by: string | null
          article_id: string
          body: string
          created_at: string
          fact_ids: string[]
          id: string
          published_at: string
        }
        Insert: {
          approved_by?: string | null
          article_id: string
          body: string
          created_at?: string
          fact_ids?: string[]
          id?: string
          published_at?: string
        }
        Update: {
          approved_by?: string | null
          article_id?: string
          body?: string
          created_at?: string
          fact_ids?: string[]
          id?: string
          published_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_updates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_updates_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          ai_generated: boolean
          approved_by: string | null
          author_id: string | null
          canonical_url: string | null
          category_id: string | null
          content: Json
          created_at: string
          excerpt: string | null
          hero_image_id: string | null
          id: string
          lead: string | null
          model_used: string | null
          prompt_version: string | null
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["article_status"]
          story_id: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          approved_by?: string | null
          author_id?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content?: Json
          created_at?: string
          excerpt?: string | null
          hero_image_id?: string | null
          id?: string
          lead?: string | null
          model_used?: string | null
          prompt_version?: string | null
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["article_status"]
          story_id: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          approved_by?: string | null
          author_id?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content?: Json
          created_at?: string
          excerpt?: string | null
          hero_image_id?: string | null
          id?: string
          lead?: string | null
          model_used?: string | null
          prompt_version?: string | null
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["article_status"]
          story_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_hero_image_id_fkey"
            columns: ["hero_image_id"]
            isOneToOne: false
            referencedRelation: "image_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      authors: {
        Row: {
          active: boolean
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          name: string
          profile_id: string | null
          role_title: string | null
          slug: string
          updated_at: string
          x_url: string | null
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          profile_id?: string | null
          role_title?: string | null
          slug: string
          updated_at?: string
          x_url?: string | null
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          profile_id?: string | null
          role_title?: string | null
          slug?: string
          updated_at?: string
          x_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          position: number
          seo_description: string | null
          seo_title: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          aliases: string[]
          country: string | null
          created_at: string
          founded_year: number | null
          id: string
          league_id: string | null
          logo_id: string | null
          name: string
          short_name: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          country?: string | null
          created_at?: string
          founded_year?: number | null
          id?: string
          league_id?: string | null
          logo_id?: string | null
          name: string
          short_name?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          country?: string | null
          created_at?: string
          founded_year?: number | null
          id?: string
          league_id?: string | null
          logo_id?: string | null
          name?: string
          short_name?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_logo_id_fkey"
            columns: ["logo_id"]
            isOneToOne: false
            referencedRelation: "image_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      facts: {
        Row: {
          confidence: number
          created_at: string
          id: string
          object: string | null
          predicate: string
          source_id: string | null
          source_item_id: string | null
          statement_pl: string
          story_id: string
          subject: string
          superseded_by: string | null
          value: Json | null
          verified: boolean
        }
        Insert: {
          confidence: number
          created_at?: string
          id?: string
          object?: string | null
          predicate: string
          source_id?: string | null
          source_item_id?: string | null
          statement_pl: string
          story_id: string
          subject: string
          superseded_by?: string | null
          value?: Json | null
          verified?: boolean
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          object?: string | null
          predicate?: string
          source_id?: string | null
          source_item_id?: string | null
          statement_pl?: string
          story_id?: string
          subject?: string
          superseded_by?: string | null
          value?: Json | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "facts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "source_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "facts"
            referencedColumns: ["id"]
          },
        ]
      }
      image_assets: {
        Row: {
          alt: string
          copyright: string | null
          created_at: string
          height: number
          id: string
          is_ai_generated: boolean
          kind: Database["public"]["Enums"]["image_kind"]
          license: string
          photographer: string | null
          source: string
          storage_path: string | null
          url: string
          width: number
        }
        Insert: {
          alt: string
          copyright?: string | null
          created_at?: string
          height: number
          id?: string
          is_ai_generated?: boolean
          kind?: Database["public"]["Enums"]["image_kind"]
          license: string
          photographer?: string | null
          source: string
          storage_path?: string | null
          url: string
          width: number
        }
        Update: {
          alt?: string
          copyright?: string | null
          created_at?: string
          height?: number
          id?: string
          is_ai_generated?: boolean
          kind?: Database["public"]["Enums"]["image_kind"]
          license?: string
          photographer?: string | null
          source?: string
          storage_path?: string | null
          url?: string
          width?: number
        }
        Relationships: []
      }
      jobs: {
        Row: {
          article_id: string | null
          attempts: number
          created_at: string
          dedupe_key: string | null
          error: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_run_at: string
          payload: Json
          priority: number
          processed_at: string | null
          source_id: string | null
          status: Database["public"]["Enums"]["job_status"]
          story_id: string | null
          type: Database["public"]["Enums"]["job_type"]
        }
        Insert: {
          article_id?: string | null
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json
          priority?: number
          processed_at?: string | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          story_id?: string | null
          type: Database["public"]["Enums"]["job_type"]
        }
        Update: {
          article_id?: string | null
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json
          priority?: number
          processed_at?: string | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          story_id?: string | null
          type?: Database["public"]["Enums"]["job_type"]
        }
        Relationships: [
          {
            foreignKeyName: "jobs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          country: string | null
          created_at: string
          id: string
          logo_id: string | null
          name: string
          slug: string
          tier: number | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          logo_id?: string | null
          name: string
          slug: string
          tier?: number | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          logo_id?: string | null
          name?: string
          slug?: string
          tier?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_logo_id_fkey"
            columns: ["logo_id"]
            isOneToOne: false
            referencedRelation: "image_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_calls: {
        Row: {
          cost_usd: number | null
          created_at: string
          error: string | null
          id: string
          job_id: string | null
          latency_ms: number | null
          model: string
          ok: boolean
          prompt_version: string | null
          stage: string
          story_id: string | null
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string | null
          latency_ms?: number | null
          model: string
          ok?: boolean
          prompt_version?: string | null
          stage: string
          story_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string | null
          latency_ms?: number | null
          model?: string
          ok?: boolean
          prompt_version?: string | null
          stage?: string
          story_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_calls_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          aliases: string[]
          birth_date: string | null
          country: string | null
          created_at: string
          current_club_id: string | null
          external_ids: Json
          full_name: string | null
          id: string
          image_id: string | null
          name: string
          position: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          birth_date?: string | null
          country?: string | null
          created_at?: string
          current_club_id?: string | null
          external_ids?: Json
          full_name?: string | null
          id?: string
          image_id?: string | null
          name: string
          position?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          birth_date?: string | null
          country?: string | null
          created_at?: string
          current_club_id?: string | null
          external_ids?: Json
          full_name?: string | null
          id?: string
          image_id?: string | null
          name?: string
          position?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_current_club_id_fkey"
            columns: ["current_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "image_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      source_items: {
        Row: {
          author: string | null
          content: string | null
          created_at: string
          external_id: string | null
          hash: string
          id: string
          processed_at: string | null
          published_at: string | null
          raw_data: Json | null
          source_id: string
          title: string
          title_normalized: string
          url: string
        }
        Insert: {
          author?: string | null
          content?: string | null
          created_at?: string
          external_id?: string | null
          hash: string
          id?: string
          processed_at?: string | null
          published_at?: string | null
          raw_data?: Json | null
          source_id: string
          title: string
          title_normalized: string
          url: string
        }
        Update: {
          author?: string | null
          content?: string | null
          created_at?: string
          external_id?: string | null
          hash?: string
          id?: string
          processed_at?: string | null
          published_at?: string | null
          raw_data?: Json | null
          source_id?: string
          title?: string
          title_normalized?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          active: boolean
          consecutive_failures: number
          country: string
          created_at: string
          etag: string | null
          fetch_interval_minutes: number
          id: string
          kind: Database["public"]["Enums"]["source_kind"]
          language: string
          last_checked_at: string | null
          last_modified: string | null
          last_success_at: string | null
          name: string
          rss_url: string | null
          sport: string
          trust_score: number
          type: Database["public"]["Enums"]["source_type"]
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          consecutive_failures?: number
          country?: string
          created_at?: string
          etag?: string | null
          fetch_interval_minutes?: number
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          language?: string
          last_checked_at?: string | null
          last_modified?: string | null
          last_success_at?: string | null
          name: string
          rss_url?: string | null
          sport?: string
          trust_score: number
          type: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          consecutive_failures?: number
          country?: string
          created_at?: string
          etag?: string | null
          fetch_interval_minutes?: number
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          language?: string
          last_checked_at?: string | null
          last_modified?: string | null
          last_success_at?: string | null
          name?: string
          rss_url?: string | null
          sport?: string
          trust_score?: number
          type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          category_id: string | null
          created_at: string
          embedding: string | null
          event_type: string
          first_seen_at: string
          id: string
          importance: number
          last_updated_at: string
          sport: string
          status: Database["public"]["Enums"]["story_status"]
          summary: string | null
          title: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          embedding?: string | null
          event_type?: string
          first_seen_at?: string
          id?: string
          importance?: number
          last_updated_at?: string
          sport?: string
          status?: Database["public"]["Enums"]["story_status"]
          summary?: string | null
          title: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          embedding?: string | null
          event_type?: string
          first_seen_at?: string
          id?: string
          importance?: number
          last_updated_at?: string
          sport?: string
          status?: Database["public"]["Enums"]["story_status"]
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_assessments: {
        Row: {
          approved_fact_ids: string[]
          confidence: number
          conflicts: Json
          created_at: string
          model_used: string | null
          prompt_version: string | null
          publishability: Database["public"]["Enums"]["publishability"]
          reasoning: string | null
          story_id: string
          updated_at: string
        }
        Insert: {
          approved_fact_ids?: string[]
          confidence: number
          conflicts?: Json
          created_at?: string
          model_used?: string | null
          prompt_version?: string | null
          publishability: Database["public"]["Enums"]["publishability"]
          reasoning?: string | null
          story_id: string
          updated_at?: string
        }
        Update: {
          approved_fact_ids?: string[]
          confidence?: number
          conflicts?: Json
          created_at?: string
          model_used?: string | null
          prompt_version?: string | null
          publishability?: Database["public"]["Enums"]["publishability"]
          reasoning?: string | null
          story_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_assessments_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: true
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_sources: {
        Row: {
          created_at: string
          match_method: string
          similarity: number | null
          source_item_id: string
          story_id: string
        }
        Insert: {
          created_at?: string
          match_method?: string
          similarity?: number | null
          source_item_id: string
          story_id: string
        }
        Update: {
          created_at?: string
          match_method?: string
          similarity?: number | null
          source_item_id?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_sources_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "source_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_sources_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          confirmed_at: string | null
          confirmed_by_source_id: string | null
          contract_until: string | null
          created_at: string
          currency: string | null
          fee: number | null
          from_club_id: string | null
          id: string
          player_id: string
          season: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          story_id: string | null
          to_club_id: string | null
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by_source_id?: string | null
          contract_until?: string | null
          created_at?: string
          currency?: string | null
          fee?: number | null
          from_club_id?: string | null
          id?: string
          player_id: string
          season?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          story_id?: string | null
          to_club_id?: string | null
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by_source_id?: string | null
          contract_until?: string | null
          created_at?: string
          currency?: string | null
          fee?: number | null
          from_club_id?: string | null
          id?: string
          player_id?: string
          season?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          story_id?: string | null
          to_club_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_confirmed_by_source_id_fkey"
            columns: ["confirmed_by_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_club_id_fkey"
            columns: ["from_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_club_id_fkey"
            columns: ["to_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_jobs: {
        Args: {
          p_limit?: number
          p_types?: Database["public"]["Enums"]["job_type"][]
          p_worker?: string
        }
        Returns: {
          article_id: string | null
          attempts: number
          created_at: string
          dedupe_key: string | null
          error: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_run_at: string
          payload: Json
          priority: number
          processed_at: string | null
          source_id: string | null
          status: Database["public"]["Enums"]["job_status"]
          story_id: string | null
          type: Database["public"]["Enums"]["job_type"]
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_job: { Args: { p_id: string }; Returns: undefined }
      defer_job: {
        Args: { p_delay: string; p_id: string; p_reason: string }
        Returns: undefined
      }
      enqueue_job: {
        Args: {
          p_article_id?: string
          p_dedupe_key?: string
          p_payload?: Json
          p_priority?: number
          p_source_id?: string
          p_story_id?: string
          p_type: Database["public"]["Enums"]["job_type"]
        }
        Returns: string
      }
      fail_job: { Args: { p_error: string; p_id: string }; Returns: undefined }
      find_entity_story: {
        Args: { p_since: string; p_title: string }
        Returns: string
      }
      find_similar_stories: {
        Args: {
          p_since: string
          p_threshold: number
          p_title_normalized: string
        }
        Returns: {
          similarity: number
          story_id: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_editor: { Args: never; Returns: boolean }
      link_source_item_to_story: {
        Args: {
          p_category_id: string
          p_event_type: string
          p_importance: number
          p_source_item_id: string
        }
        Returns: {
          out_created: boolean
          out_match_method: string
          out_similarity: number
          out_story_id: string
        }[]
      }
      list_due_sources: {
        Args: never
        Returns: {
          active: boolean
          consecutive_failures: number
          country: string
          created_at: string
          etag: string | null
          fetch_interval_minutes: number
          id: string
          kind: Database["public"]["Enums"]["source_kind"]
          language: string
          last_checked_at: string | null
          last_modified: string | null
          last_success_at: string | null
          name: string
          rss_url: string | null
          sport: string
          trust_score: number
          type: Database["public"]["Enums"]["source_type"]
          updated_at: string
          url: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sources"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      normalize_title: { Args: { p_title: string }; Returns: string }
      requeue_dead_job: { Args: { p_job_id: string }; Returns: boolean }
      requeue_dead_jobs: {
        Args: { p_type?: Database["public"]["Enums"]["job_type"] }
        Returns: number
      }
      requeue_stale_jobs: { Args: { p_older_than?: string }; Returns: number }
      title_contains_label: {
        Args: { p_label: string; p_title: string }
        Returns: boolean
      }
    }
    Enums: {
      article_status:
        | "draft"
        | "review"
        | "approved"
        | "published"
        | "rejected"
        | "archived"
      entity_type: "player" | "club" | "league"
      image_kind: "hero" | "logo" | "portrait"
      job_status:
        | "queued"
        | "running"
        | "done"
        | "failed"
        | "dead"
        | "cancelled"
      job_type:
        | "FETCH_SOURCE"
        | "PROCESS_STORY"
        | "EXTRACT_FACTS"
        | "VALIDATE_FACTS"
        | "GENERATE_ARTICLE"
        | "GENERATE_TITLE"
        | "GENERATE_SEO"
        | "CHECK_ARTICLE"
        | "PUBLISH_ARTICLE"
        | "GENERATE_IMAGE"
        | "UPDATE_ARTICLE"
        | "GENERATE_EMBEDDING"
      publishability: "auto" | "review" | "reject"
      source_kind: "rss" | "json_api" | "html"
      source_type:
        | "official_club"
        | "official_league"
        | "official_federation"
        | "journalist"
        | "major_outlet"
        | "local_outlet"
        | "aggregator"
        | "social"
      story_status:
        | "new"
        | "clustering"
        | "extracting"
        | "validating"
        | "drafting"
        | "review"
        | "approved"
        | "published"
        | "rejected"
        | "blocked"
      transfer_status:
        | "rumour"
        | "interest"
        | "negotiations"
        | "agreement"
        | "medical"
        | "official"
        | "failed"
      user_role: "admin" | "editor" | "viewer"
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
      article_status: [
        "draft",
        "review",
        "approved",
        "published",
        "rejected",
        "archived",
      ],
      entity_type: ["player", "club", "league"],
      image_kind: ["hero", "logo", "portrait"],
      job_status: ["queued", "running", "done", "failed", "dead", "cancelled"],
      job_type: [
        "FETCH_SOURCE",
        "PROCESS_STORY",
        "EXTRACT_FACTS",
        "VALIDATE_FACTS",
        "GENERATE_ARTICLE",
        "GENERATE_TITLE",
        "GENERATE_SEO",
        "CHECK_ARTICLE",
        "PUBLISH_ARTICLE",
        "GENERATE_IMAGE",
        "UPDATE_ARTICLE",
        "GENERATE_EMBEDDING",
      ],
      publishability: ["auto", "review", "reject"],
      source_kind: ["rss", "json_api", "html"],
      source_type: [
        "official_club",
        "official_league",
        "official_federation",
        "journalist",
        "major_outlet",
        "local_outlet",
        "aggregator",
        "social",
      ],
      story_status: [
        "new",
        "clustering",
        "extracting",
        "validating",
        "drafting",
        "review",
        "approved",
        "published",
        "rejected",
        "blocked",
      ],
      transfer_status: [
        "rumour",
        "interest",
        "negotiations",
        "agreement",
        "medical",
        "official",
        "failed",
      ],
      user_role: ["admin", "editor", "viewer"],
    },
  },
} as const

