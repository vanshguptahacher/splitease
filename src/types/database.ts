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
      expenses: {
        Row: {
          id: string;
          group_id: string;
          description: string | null;
          amount_minor: number;
          currency: string;
          paid_by: string;
          split_type: 'equal' | 'exact' | 'percent';
          category: ExpenseCategory | null;
          expense_date: string;
          created_by: string;
          client_request_id: string | null;
          version: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
        };
        Insert: {
          id?: string;
          group_id: string;
          description?: string | null;
          amount_minor: number;
          currency?: string;
          paid_by: string;
          split_type: 'equal' | 'exact' | 'percent';
          category?: ExpenseCategory | null;
          expense_date: string;
          created_by: string;
          client_request_id?: string | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Update: {
          id?: string;
          group_id?: string;
          description?: string | null;
          amount_minor?: number;
          currency?: string;
          paid_by?: string;
          split_type?: 'equal' | 'exact' | 'percent';
          category?: ExpenseCategory | null;
          expense_date?: string;
          created_by?: string;
          client_request_id?: string | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'expenses_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_paid_by_fkey';
            columns: ['paid_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_deleted_by_fkey';
            columns: ['deleted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      expense_splits: {
        Row: {
          expense_id: string;
          user_id: string;
          share_minor: number;
          percent_bp: number | null;
        };
        Insert: {
          expense_id: string;
          user_id: string;
          share_minor: number;
          percent_bp?: number | null;
        };
        Update: {
          expense_id?: string;
          user_id?: string;
          share_minor?: number;
          percent_bp?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_splits_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expense_splits_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_log: {
        Row: {
          id: number;
          group_id: string;
          actor_id: string;
          action: ActivityAction;
          ref_id: string | null;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          group_id: string;
          actor_id: string;
          action: ActivityAction;
          ref_id?: string | null;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
          group_id?: string;
          actor_id?: string;
          action?: ActivityAction;
          ref_id?: string | null;
          details?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_log_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      settlements: {
        Row: {
          id: string;
          group_id: string;
          from_user: string;
          to_user: string;
          amount_minor: number;
          currency: string;
          method: SettlementMethod;
          note: string | null;
          upi_txn_ref: string | null;
          status: SettlementStatus;
          created_by: string;
          client_request_id: string | null;
          created_at: string;
          updated_at: string;
          status_changed_at: string;
          confirmed_at: string | null;
        };
        Insert: {
          id?: string;
          group_id: string;
          from_user: string;
          to_user: string;
          amount_minor: number;
          currency?: string;
          method: SettlementMethod;
          note?: string | null;
          upi_txn_ref?: string | null;
          status?: SettlementStatus;
          created_by: string;
          client_request_id?: string | null;
          created_at?: string;
          updated_at?: string;
          status_changed_at?: string;
          confirmed_at?: string | null;
        };
        Update: {
          id?: string;
          group_id?: string;
          from_user?: string;
          to_user?: string;
          amount_minor?: number;
          currency?: string;
          method?: SettlementMethod;
          note?: string | null;
          upi_txn_ref?: string | null;
          status?: SettlementStatus;
          created_by?: string;
          client_request_id?: string | null;
          created_at?: string;
          updated_at?: string;
          status_changed_at?: string;
          confirmed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'settlements_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_from_user_fkey';
            columns: ['from_user'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_to_user_fkey';
            columns: ['to_user'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
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
          last_activity_at: string;
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
      add_expense: {
        Args: {
          p_group: string;
          p_client_request_id: string | null;
          p_description: string | null;
          p_amount_minor: number;
          p_paid_by: string;
          p_split_type: 'equal' | 'exact' | 'percent';
          p_participants: Json;
          p_category: string | null;
          p_expense_date: string;
        };
        Returns: string;
      };
      edit_expense: {
        Args: {
          p_expense: string;
          p_expected_version: number;
          p_description: string | null;
          p_amount_minor: number;
          p_paid_by: string;
          p_split_type: 'equal' | 'exact' | 'percent';
          p_participants: Json;
          p_category: string | null;
          p_expense_date: string;
        };
        Returns: number;
      };
      delete_expense: {
        Args: {
          p_expense: string;
        };
        Returns: void;
      };
      restore_expense: {
        Args: {
          p_expense: string;
        };
        Returns: void;
      };
      list_expenses: {
        Args: {
          p_group: string;
          p_limit?: number;
          p_cursor?: Json | null;
        };
        Returns: {
          id: string;
          description: string | null;
          category: string | null;
          amount_minor: number;
          paid_by: string;
          expense_date: string;
          created_by: string;
          created_at: string;
          version: number;
          participant_count: number;
          my_share_minor: number;
          my_net_minor: number;
          is_locked: boolean;
          can_edit: boolean;
          next_cursor: Json;
        }[];
      };
      get_expense: {
        Args: {
          p_expense: string;
        };
        Returns: {
          expense: Database['public']['Tables']['expenses']['Row'];
          splits: {
            user_id: string;
            share_minor: number;
            percent_bp: number | null;
          }[];
          is_locked: boolean;
          can_edit: boolean;
          can_restore: boolean;
          activity: {
            id: number;
            action: string;
            actor_id: string;
            actor_name: string;
            details: Json;
            created_at: string;
          }[];
        };
      };
      list_activity: {
        Args: {
          p_limit?: number;
          p_cursor?: Json | null;
        };
        Returns: {
          id: number;
          group_id: string;
          group_name: string;
          actor_id: string;
          actor_name: string;
          action: string;
          ref_id: string | null;
          details: Json;
          created_at: string;
          next_cursor: Json;
        }[];
      };
      get_group_balances: {
        Args: {
          p_group: string;
        };
        Returns: {
          members: {
            user_id: string;
            net_minor: number;
          }[];
          payments: {
            seq: number;
            from_user: string;
            to_user: string;
            amount_minor: number;
          }[];
          my_net_minor: number;
          pending_for_me: number;
        };
      };
      get_my_balance_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          owed_to_me_minor: number;
          i_owe_minor: number;
          net_minor: number;
          groups_with_dues: number;
          pending_for_me: number;
        };
      };
      create_settlement: {
        Args: {
          p_group: string;
          p_client_request_id?: string | null;
          p_from_user: string;
          p_to_user: string;
          p_amount_minor: number;
          p_method: string;
          p_note?: string | null;
        };
        Returns: string;
      };
      confirm_settlement: {
        Args: {
          p_settlement: string;
        };
        Returns: void;
      };
      dispute_settlement: {
        Args: {
          p_settlement: string;
        };
        Returns: void;
      };
      cancel_settlement: {
        Args: {
          p_settlement: string;
        };
        Returns: void;
      };
      list_settlements: {
        Args: {
          p_group: string;
          p_limit?: number;
          p_cursor?: Json | null;
        };
        Returns: {
          id: string;
          group_id: string;
          from_user: string;
          to_user: string;
          amount_minor: number;
          currency: string;
          method: string;
          note: string | null;
          status: string;
          created_by: string;
          created_at: string;
          status_changed_at: string;
          confirmed_at: string | null;
          can_confirm: boolean;
          can_dispute: boolean;
          can_cancel: boolean;
          can_undo: boolean;
          next_cursor: Json;
        }[];
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

export type Expense = Database['public']['Tables']['expenses']['Row'];
export type ExpenseSplit = Database['public']['Tables']['expense_splits']['Row'];
export type ActivityLog = Database['public']['Tables']['activity_log']['Row'];
export type SplitType = 'equal' | 'exact' | 'percent';
export type ExpenseCategory =
  | 'food'
  | 'groceries'
  | 'travel'
  | 'stay'
  | 'fuel'
  | 'shopping'
  | 'bills'
  | 'entertainment'
  | 'rent'
  | 'other';
export type ActivityAction =
  | 'expense_added'
  | 'expense_edited'
  | 'expense_deleted'
  | 'expense_restored'
  | 'settlement_created'
  | 'settlement_confirmed'
  | 'settlement_disputed'
  | 'settlement_cancelled';

export type Settlement = Database['public']['Tables']['settlements']['Row'];
export type SettlementMethod = 'cash' | 'other' | 'upi';
export type SettlementStatus = 'pending' | 'confirmed' | 'disputed' | 'cancelled';

export type GroupBalancesResult = Database['public']['Functions']['get_group_balances']['Returns'];
export type BalanceSummaryResult = Database['public']['Functions']['get_my_balance_summary']['Returns'];
export type SettlementListItem = Database['public']['Functions']['list_settlements']['Returns'][number];


