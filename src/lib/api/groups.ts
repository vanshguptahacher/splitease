import { supabase } from '@/lib/supabase/client';
import {
  Group,
  GroupDetail,
  GroupMemberItem,
  GroupSummary,
  InvitePreview,
  InviteResult,
  JoinGroupResult,
  AccountDeletionBlockers,
  LeaveGroupResult,
} from '@/types/database';

/**
 * SplitEase Group API layer.
 * All operations call hardened PostgreSQL RPCs.
 * Direct table writes (.insert, .update, .delete) are strictly forbidden.
 */

export async function createGroup(
  name: string,
  clientRequestId?: string | null
): Promise<Group> {
  const { data, error } = await supabase.rpc('create_group', {
    p_name: name,
    p_client_request_id: clientRequestId ?? null,
  });

  if (error) throw error;
  if (!data) throw new Error('Failed to create group: no data returned');
  return data;
}

export async function listMyGroups(): Promise<GroupSummary[]> {
  const { data, error } = await supabase.rpc('list_my_groups');
  if (error) throw error;
  return data ?? [];
}

export async function getGroup(groupId: string): Promise<GroupDetail> {
  const { data, error } = await supabase.rpc('get_group', {
    p_group: groupId,
  });

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('not_a_member');
  }
  return data[0];
}

export async function getGroupMembers(
  groupId: string,
  includeFormer = false
): Promise<GroupMemberItem[]> {
  const { data, error } = await supabase.rpc('get_group_members', {
    p_group: groupId,
    p_include_former: includeFormer,
  });

  if (error) throw error;
  return data ?? [];
}

export async function renameGroup(
  groupId: string,
  name: string
): Promise<Group> {
  const { data, error } = await supabase.rpc('rename_group', {
    p_group: groupId,
    p_name: name,
  });

  if (error) throw error;
  if (!data) throw new Error('Failed to rename group: no data returned');
  return data;
}

export async function getOrCreateInvite(
  groupId: string
): Promise<InviteResult> {
  const { data, error } = await supabase.rpc('get_or_create_invite', {
    p_group: groupId,
  });

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Failed to get invite: no data returned');
  }
  return data[0];
}

export async function resetInvite(
  groupId: string
): Promise<InviteResult> {
  const { data, error } = await supabase.rpc('reset_invite', {
    p_group: groupId,
  });

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Failed to reset invite: no data returned');
  }
  return data[0];
}

export async function previewInvite(
  code: string
): Promise<InvitePreview> {
  const { data, error } = await supabase.rpc('preview_invite', {
    p_code: code,
  });

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('invalid');
  }
  return data[0];
}

export async function joinGroup(
  code: string
): Promise<JoinGroupResult> {
  const { data, error } = await supabase.rpc('join_group', {
    p_code: code,
  });

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('invalid');
  }
  return data[0];
}

export async function setMemberRole(
  groupId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<void> {
  const { error } = await supabase.rpc('set_member_role', {
    p_group: groupId,
    p_user: userId,
    p_role: role,
  });

  if (error) throw error;
}

export async function removeMember(
  groupId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase.rpc('remove_member', {
    p_group: groupId,
    p_user: userId,
  });

  if (error) throw error;
}

export async function leaveGroup(
  groupId: string
): Promise<LeaveGroupResult> {
  const { data, error } = await supabase.rpc('leave_group', {
    p_group: groupId,
  });

  if (error) throw error;
  return (data as LeaveGroupResult) ?? 'left';
}

export async function deleteGroup(
  groupId: string
): Promise<void> {
  const { error } = await supabase.rpc('delete_group', {
    p_group: groupId,
  });

  if (error) throw error;
}

export async function getAccountDeletionBlockers(): Promise<AccountDeletionBlockers> {
  const { data, error } = await supabase.rpc('account_deletion_blockers');
  if (error) throw error;
  return data as AccountDeletionBlockers;
}

export async function deleteMyAccount(
  force = false
): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account', {
    p_force: force,
  });

  if (error) throw error;
}
