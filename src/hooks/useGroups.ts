import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createGroup,
  deleteGroup,
  getAccountDeletionBlockers,
  getGroup,
  getGroupMembers,
  getOrCreateInvite,
  joinGroup,
  leaveGroup,
  listMyGroups,
  previewInvite,
  removeMember,
  renameGroup,
  resetInvite,
  setMemberRole,
} from '@/lib/api/groups';
import { queryKeys } from '@/lib/queryKeys';
import {
  AccountDeletionBlockers,
  Group,
  GroupDetail,
  GroupMemberItem,
  GroupSummary,
  InvitePreview,
  InviteResult,
  JoinGroupResult,
  LeaveGroupResult,
} from '@/types/database';

export function useGroups() {
  return useQuery<GroupSummary[], Error>({
    queryKey: queryKeys.groups.all,
    queryFn: listMyGroups,
  });
}

export function useGroup(groupId: string | undefined) {
  return useQuery<GroupDetail, Error>({
    queryKey: queryKeys.groups.detail(groupId ?? ''),
    queryFn: () => getGroup(groupId!),
    enabled: Boolean(groupId),
  });
}

export function useGroupMembers(groupId: string | undefined, includeFormer = false) {
  return useQuery<GroupMemberItem[], Error>({
    queryKey: queryKeys.groups.members(groupId ?? ''),
    queryFn: () => getGroupMembers(groupId!, includeFormer),
    enabled: Boolean(groupId),
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation<
    Group,
    Error,
    { name: string; clientRequestId?: string | null }
  >({
    mutationFn: ({ name, clientRequestId }) =>
      createGroup(name, clientRequestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    },
  });
}

export function useRenameGroup() {
  const queryClient = useQueryClient();

  return useMutation<
    Group,
    Error,
    { groupId: string; name: string }
  >({
    mutationFn: ({ groupId, name }) => renameGroup(groupId, name),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });
    },
  });
}

export function usePreviewInvite(code: string | undefined) {
  return useQuery<InvitePreview, Error>({
    queryKey: queryKeys.invites.detail(code ?? ''),
    queryFn: () => previewInvite(code!),
    enabled: Boolean(code && code.length === 8),
    retry: false,
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();

  return useMutation<JoinGroupResult, Error, string>({
    mutationFn: (code: string) => joinGroup(code),
    onSuccess: (result) => {
      if (result.r_status === 'joined' || result.r_status === 'already_member') {
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
        if (result.r_group_id) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.groups.detail(result.r_group_id),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.groups.members(result.r_group_id),
          });
        }
      }
    },
  });
}

export function useInvite(groupId: string | undefined) {
  return useQuery<InviteResult, Error>({
    queryKey: queryKeys.groups.invite(groupId ?? ''),
    queryFn: () => getOrCreateInvite(groupId!),
    enabled: Boolean(groupId),
    staleTime: 0,
    gcTime: 0, // GI11: invite codes are never cached
  });
}

export function useResetInvite() {
  const queryClient = useQueryClient();

  return useMutation<InviteResult, Error, string>({
    mutationFn: (groupId: string) => resetInvite(groupId),
    onSuccess: (_, groupId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groups.invite(groupId),
      });
    },
  });
}

export function useSetMemberRole() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { groupId: string; userId: string; role: 'admin' | 'member' }
  >({
    mutationFn: ({ groupId, userId, role }) =>
      setMemberRole(groupId, userId, role),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groups.members(groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groups.detail(groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groups.all,
      });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { groupId: string; userId: string }
  >({
    mutationFn: ({ groupId, userId }) => removeMember(groupId, userId),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groups.members(groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groups.detail(groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groups.all,
      });
    },
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();

  return useMutation<LeaveGroupResult, Error, string>({
    mutationFn: (groupId: string) => leaveGroup(groupId),
    onSuccess: (_, groupId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groups.all,
      });
      queryClient.removeQueries({
        queryKey: queryKeys.groups.detail(groupId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.groups.members(groupId),
      });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (groupId: string) => deleteGroup(groupId),
    onSuccess: (_, groupId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groups.all,
      });
      queryClient.removeQueries({
        queryKey: queryKeys.groups.detail(groupId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.groups.members(groupId),
      });
    },
  });
}

export function useAccountDeletionBlockers() {
  return useQuery<AccountDeletionBlockers, Error>({
    queryKey: ['account_deletion_blockers'],
    queryFn: getAccountDeletionBlockers,
    staleTime: 0,
    gcTime: 0,
  });
}


