export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          avatar_url: string | null;
          avatar_path: string | null;
          upi_id: string | null;
          onboarded_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          avatar_url?: string | null;
          avatar_path?: string | null;
          upi_id?: string | null;
          onboarded_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          avatar_path?: string | null;
          upi_id?: string | null;
          onboarded_at?: string | null;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          currency: string;
          created_by: string;
          client_request_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          currency?: string;
          created_by: string;
          client_request_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          currency?: string;
          created_by?: string;
          client_request_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'groups_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      group_members: {
        Row: {
          group_id: string;
          user_id: string;
          role: 'admin' | 'member';
          status: 'active' | 'left' | 'removed';
          joined_at: string;
          left_at: string | null;
          removed_by: string | null;
        };
        Insert: {
          group_id: string;
          user_id: string;
          role?: 'admin' | 'member';
          status?: 'active' | 'left' | 'removed';
          joined_at?: string;
          left_at?: string | null;
          removed_by?: string | null;
        };
        Update: {
          group_id?: string;
          user_id?: string;
          role?: 'admin' | 'member';
          status?: 'active' | 'left' | 'removed';
          joined_at?: string;
          left_at?: string | null;
          removed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'group_members_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_removed_by_fkey';
            columns: ['removed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      invites: {
        Row: {
          id: string;
          group_id: string;
          code: string;
          created_by: string;
          created_at: string;
          expires_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          group_id: string;
          code: string;
          created_by: string;
          created_at?: string;
          expires_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          group_id?: string;
          code?: string;
          created_by?: string;
          created_at?: string;
          expires_at?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invites_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      invite_attempts: {
        Row: {
          id: number;
          user_id: string;
          attempted_at: string;
          success: boolean;
        };
        Insert: {
          id?: never;
          user_id: string;
          attempted_at?: string;
          success: boolean;
        };
        Update: {
          id?: never;
          user_id?: string;
          attempted_at?: string;
          success?: boolean;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      ensure_my_profile: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      delete_my_account: {
        Args: {
          p_force?: boolean;
        };
        Returns: void;
      };
      is_active_member: {
        Args: {
          p_group: string;
        };
        Returns: boolean;
      };
      is_group_admin: {
        Args: {
          p_group: string;
        };
        Returns: boolean;
      };
      generate_invite_code: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      member_is_settled: {
        Args: {
          p_group: string;
          p_user: string;
        };
        Returns: boolean;
      };
      group_is_settled: {
        Args: {
          p_group: string;
        };
        Returns: boolean;
      };
      create_group: {
        Args: {
          p_name: string;
          p_client_request_id?: string | null;
        };
        Returns: Database['public']['Tables']['groups']['Row'];
      };
      list_my_groups: {
        Args: Record<PropertyKey, never>;
        Returns: {
          group_id: string;
          name: string;
          my_role: 'admin' | 'member';
          member_count: number;
          joined_at: string;
        }[];
      };
      get_group: {
        Args: {
          p_group: string;
        };
        Returns: {
          id: string;
          name: string;
          currency: string;
          created_by: string;
          created_at: string;
          updated_at: string;
          my_role: 'admin' | 'member';
          member_count: number;
        }[];
      };
      get_group_members: {
        Args: {
          p_group: string;
          p_include_former?: boolean;
        };
        Returns: {
          user_id: string;
          name: string;
          avatar_path: string | null;
          avatar_url: string | null;
          upi_id: string | null;
          role: 'admin' | 'member';
          status: 'active' | 'left' | 'removed';
          joined_at: string;
        }[];
      };
      rename_group: {
        Args: {
          p_group: string;
          p_name: string;
        };
        Returns: Database['public']['Tables']['groups']['Row'];
      };
      get_or_create_invite: {
        Args: {
          p_group: string;
        };
        Returns: {
          code: string;
          expires_at: string;
        }[];
      };
      reset_invite: {
        Args: {
          p_group: string;
        };
        Returns: {
          code: string;
          expires_at: string;
        }[];
      };
      preview_invite: {
        Args: {
          p_code: string;
        };
        Returns: {
          status: string;
          group_name: string | null;
          member_count: number | null;
          inviter_name: string | null;
        }[];
      };
      join_group: {
        Args: {
          p_code: string;
        };
        Returns: {
          r_status: string;
          r_group_id: string | null;
          r_group_name: string | null;
        }[];
      };
      set_member_role: {
        Args: {
          p_group: string;
          p_user: string;
          p_role: 'admin' | 'member';
        };
        Returns: void;
      };
      remove_member: {
        Args: {
          p_group: string;
          p_user: string;
        };
        Returns: void;
      };
      leave_group: {
        Args: {
          p_group: string;
        };
        Returns: 'left' | 'group_deleted';
      };
      delete_group: {
        Args: {
          p_group: string;
        };
        Returns: void;
      };
      account_deletion_blockers: {
        Args: Record<PropertyKey, never>;
        Returns: {
          sole_admin_groups: {
            id: string;
            name: string;
          }[];
          unsettled_groups: {
            id: string;
            name: string;
          }[];
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
export type Group = Database['public']['Tables']['groups']['Row'];
export type GroupMember = Database['public']['Tables']['group_members']['Row'];
export type Invite = Database['public']['Tables']['invites']['Row'];
export type MemberRole = 'admin' | 'member';
export type MemberStatus = 'active' | 'left' | 'removed';

export type GroupSummary = Database['public']['Functions']['list_my_groups']['Returns'][number];
export type GroupDetail = Database['public']['Functions']['get_group']['Returns'][number];
export type GroupMemberItem = Database['public']['Functions']['get_group_members']['Returns'][number];
export type InviteResult = Database['public']['Functions']['get_or_create_invite']['Returns'][number];
export type InvitePreview = Database['public']['Functions']['preview_invite']['Returns'][number];
export type JoinGroupResult = Database['public']['Functions']['join_group']['Returns'][number];
export type InviteStatus = 'ok' | 'invalid' | 'revoked' | 'expired' | 'already_member' | 'removed' | 'group_full' | 'too_many_groups' | 'rate_limited';
export type JoinStatus = 'joined' | 'already_member' | 'removed' | 'group_full' | 'too_many_groups' | 'invalid' | 'revoked' | 'expired' | 'rate_limited';
export type AccountDeletionBlockers = Database['public']['Functions']['account_deletion_blockers']['Returns'];
export type LeaveGroupResult = Database['public']['Functions']['leave_group']['Returns'];

