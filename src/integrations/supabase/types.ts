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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          actions: Json
          board_id: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          name: string
          trigger: Json
        }
        Insert: {
          actions?: Json
          board_id: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          trigger: Json
        }
        Update: {
          actions?: Json
          board_id?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          trigger?: Json
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          error: string | null
          id: string
          item_id: string | null
          ran_at: string
          rule_id: string
          status: string
        }
        Insert: {
          error?: string | null
          id?: string
          item_id?: string | null
          ran_at?: string
          rule_id: string
          status: string
        }
        Update: {
          error?: string | null
          id?: string
          item_id?: string | null
          ran_at?: string
          rule_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      board_columns: {
        Row: {
          board_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["column_kind"]
          position: number
          settings: Json
          title: string
          width: number
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["column_kind"]
          position?: number
          settings?: Json
          title: string
          width?: number
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["column_kind"]
          position?: number
          settings?: Json
          title?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "board_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      board_views: {
        Row: {
          board_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["view_kind"]
          name: string
          position: number
          settings: Json
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["view_kind"]
          name: string
          position?: number
          settings?: Json
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["view_kind"]
          name?: string
          position?: number
          settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "board_views_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          archived_at: string | null
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          embed_token: string | null
          icon: string | null
          id: string
          name: string
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          embed_token?: string | null
          icon?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          embed_token?: string | null
          icon?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          edited_at: string | null
          id: string
          item_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          item_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_widgets: {
        Row: {
          created_at: string
          dashboard_id: string
          id: string
          kind: string
          position: Json
          settings: Json
        }
        Insert: {
          created_at?: string
          dashboard_id: string
          id?: string
          kind: string
          position?: Json
          settings?: Json
        }
        Update: {
          created_at?: string
          dashboard_id?: string
          id?: string
          kind?: string
          position?: Json
          settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboards: {
        Row: {
          created_at: string
          id: string
          layout: Json
          name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          layout?: Json
          name?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          layout?: Json
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          form_id: string
          id: string
          item_id: string | null
          payload: Json
          submitted_at: string
        }
        Insert: {
          form_id: string
          id?: string
          item_id?: string | null
          payload: Json
          submitted_at?: string
        }
        Update: {
          form_id?: string
          id?: string
          item_id?: string | null
          payload?: Json
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          board_id: string
          created_at: string
          created_by: string | null
          description: string | null
          fields: Json
          id: string
          is_published: boolean
          redirect_url: string | null
          slug: string
          title: string
        }
        Insert: {
          board_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_published?: boolean
          redirect_url?: string | null
          slug: string
          title: string
        }
        Update: {
          board_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_published?: boolean
          redirect_url?: string | null
          slug?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          board_id: string
          collapsed: boolean
          color: string
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          board_id: string
          collapsed?: boolean
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Update: {
          board_id?: string
          collapsed?: boolean
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "groups_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_dispatches: {
        Row: {
          attempts: number
          created_at: string
          direction: string
          error: string | null
          id: string
          item_id: string | null
          next_retry_at: string | null
          payload: Json
          status_code: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          item_id?: string | null
          next_retry_at?: string | null
          payload: Json
          status_code?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          item_id?: string | null
          next_retry_at?: string | null
          payload?: Json
          status_code?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_dispatches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_dispatches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      item_activity: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          item_id: string
          kind: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          item_id: string
          kind: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          item_id?: string
          kind?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "item_activity_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_external_refs: {
        Row: {
          external_id: string
          external_kind: string | null
          external_url: string | null
          item_id: string
          source: string
          updated_at: string
        }
        Insert: {
          external_id: string
          external_kind?: string | null
          external_url?: string | null
          item_id: string
          source: string
          updated_at?: string
        }
        Update: {
          external_id?: string
          external_kind?: string | null
          external_url?: string | null
          item_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_external_refs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_files: {
        Row: {
          created_at: string
          id: string
          item_id: string
          mime_type: string | null
          name: string
          path: string
          size_bytes: number | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          mime_type?: string | null
          name: string
          path: string
          size_bytes?: number | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          mime_type?: string | null
          name?: string
          path?: string
          size_bytes?: number | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_files_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_values: {
        Row: {
          column_id: string
          date_end_value: string | null
          date_value: string | null
          item_id: string
          link_label: string | null
          link_url: string | null
          number_value: number | null
          people_user_ids: string[] | null
          status_option_id: string | null
          text_value: string | null
          updated_at: string
        }
        Insert: {
          column_id: string
          date_end_value?: string | null
          date_value?: string | null
          item_id: string
          link_label?: string | null
          link_url?: string | null
          number_value?: number | null
          people_user_ids?: string[] | null
          status_option_id?: string | null
          text_value?: string | null
          updated_at?: string
        }
        Update: {
          column_id?: string
          date_end_value?: string | null
          date_value?: string | null
          item_id?: string
          link_label?: string | null
          link_url?: string | null
          number_value?: number | null
          people_user_ids?: string[] | null
          status_option_id?: string | null
          text_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_values_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "board_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_values_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          archived_at: string | null
          board_id: string
          created_at: string
          created_by: string | null
          group_id: string | null
          id: string
          parent_item_id: string | null
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          board_id: string
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          parent_item_id?: string | null
          position?: number
          title?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          board_id?: string
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          parent_item_id?: string | null
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          locked_reason: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          locked_reason?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          locked_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_integrations: {
        Row: {
          created_at: string
          created_by: string
          enabled: boolean
          id: string
          kind: string
          shared_secret: string
          target_board_id: string | null
          tess_base_url: string | null
          tess_workspace_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          enabled?: boolean
          id?: string
          kind: string
          shared_secret: string
          target_board_id?: string | null
          tess_base_url?: string | null
          tess_workspace_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          kind?: string
          shared_secret?: string
          target_board_id?: string | null
          tess_base_url?: string | null
          tess_workspace_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_integrations_target_board_id_fkey"
            columns: ["target_board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          locked_reason: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          locked_reason?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          locked_reason?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invite: { Args: { _token: string }; Returns: string }
      board_workspace: { Args: { _board: string }; Returns: string }
      dashboard_workspace: { Args: { _dash: string }; Returns: string }
      get_invite_preview: {
        Args: { _token: string }
        Returns: {
          accepted: boolean
          email: string
          expires_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          workspace_id: string
          workspace_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_ws_role: {
        Args: {
          _roles: Database["public"]["Enums"]["workspace_role"][]
          _user: string
          _ws: string
        }
        Returns: boolean
      }
      is_actor_active: {
        Args: { _user: string; _ws: string }
        Returns: boolean
      }
      is_member: { Args: { _user: string; _ws: string }; Returns: boolean }
      item_workspace: { Args: { _item: string }; Returns: string }
    }
    Enums: {
      app_role: "super_admin"
      column_kind:
        | "text"
        | "status"
        | "people"
        | "date"
        | "timeline"
        | "number"
        | "formula"
        | "link"
      view_kind: "table" | "kanban" | "calendar" | "workload"
      workspace_role: "owner" | "admin" | "member" | "viewer"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["super_admin"],
      column_kind: [
        "text",
        "status",
        "people",
        "date",
        "timeline",
        "number",
        "formula",
        "link",
      ],
      view_kind: ["table", "kanban", "calendar", "workload"],
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
