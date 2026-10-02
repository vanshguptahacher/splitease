import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Profile, ProfileUpdate } from '@/types';
import { queryKeys } from '@/lib/queryKeys';

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return data;
  }

  // Missing profile row: call ensure_my_profile() RPC (Case C10)
  const { data: rpcProfile, error: rpcError } = await supabase.rpc('ensure_my_profile');
  if (rpcError) {
    throw rpcError;
  }

  if (!rpcProfile) {
    throw new Error('Could not retrieve or create profile.');
  }

  return rpcProfile;
}

export function useProfile(userId?: string) {
  const queryClient = useQueryClient();
  const queryKey = userId ? queryKeys.profile(userId) : (['profile'] as const);

  const query = useQuery({
    queryKey,
    queryFn: () => {
      if (!userId) throw new Error('User ID is required to fetch profile');
      return fetchProfile(userId);
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: ProfileUpdate) => {
      if (!userId) throw new Error('No user signed in');
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(queryKey, updatedProfile);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    updateProfile: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
