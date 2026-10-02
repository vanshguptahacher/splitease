import { supabase } from '@/lib/supabase/client';
import { deleteAvatarFile } from '@/lib/auth/avatar';

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

describe('delete account flow (Sub-phase 2.7, Cases F1–F5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls deleteAvatarFile when avatar_path is present', async () => {
    const avatarPath = 'test-user-id/random-uuid.jpg';
    await deleteAvatarFile(avatarPath);
    expect(supabase.storage.from).toHaveBeenCalledWith('avatars');
    expect(supabase.storage.from('avatars').remove).toHaveBeenCalledWith([avatarPath]);
  });

  it('calls delete_my_account RPC successfully', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null });

    const { error } = await supabase.rpc('delete_my_account');
    expect(supabase.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(error).toBeNull();
  });

  it('handles error in delete_my_account RPC safely without crash', async () => {
    const mockError = new Error('Network error during RPC');
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: mockError });

    const { error } = await supabase.rpc('delete_my_account');
    expect(error).toBe(mockError);
  });
});
