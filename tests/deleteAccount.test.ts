import { supabase } from '@/lib/supabase/client';
import { deleteAvatarFile } from '@/lib/auth/avatar';
import { deleteMyAccount, getAccountDeletionBlockers } from '@/lib/api/groups';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
    storage: {
      from: jest.fn().mockReturnValue({
        remove: jest.fn().mockResolvedValue({ error: null }),
      }),
    },
    auth: {
      signOut: jest.fn().mockResolvedValue({ error: null }),
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null,
      }),
    },
  },
}));

describe('delete account API flow (Sub-phase 3.8, Cases GD1–GD6, F1–F9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls deleteAvatarFile when avatar_path is present', async () => {
    const avatarPath = 'test-user-id/random-uuid.jpg';
    await deleteAvatarFile(avatarPath);
    expect(supabase.storage.from).toHaveBeenCalledWith('avatars');
    expect(supabase.storage.from('avatars').remove).toHaveBeenCalledWith([avatarPath]);
  });

  it('calls getAccountDeletionBlockers RPC successfully', async () => {
    const mockBlockers = {
      sole_admin_groups: [{ id: 'g1', name: 'Group 1' }],
      unsettled_groups: [],
    };
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: mockBlockers, error: null });

    const result = await getAccountDeletionBlockers();
    expect(supabase.rpc).toHaveBeenCalledWith('account_deletion_blockers');
    expect(result).toEqual(mockBlockers);
  });

  it('calls delete_my_account RPC with force=false by default', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: null, error: null });

    await deleteMyAccount();
    expect(supabase.rpc).toHaveBeenCalledWith('delete_my_account', { p_force: false });
  });

  it('calls delete_my_account RPC with force=true when requested', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: null, error: null });

    await deleteMyAccount(true);
    expect(supabase.rpc).toHaveBeenCalledWith('delete_my_account', { p_force: true });
  });

  it('throws error when delete_my_account RPC fails', async () => {
    const mockError = new Error('sole_admin');
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: null, error: mockError });

    await expect(deleteMyAccount(false)).rejects.toThrow('sole_admin');
  });
});
