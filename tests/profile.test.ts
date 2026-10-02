import { fetchProfile } from '../src/hooks/useProfile';
import { supabase } from '../src/lib/supabase/client';

jest.mock('../src/lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

describe('fetchProfile', () => {
  const mockUserId = 'usr-12345';
  const mockProfile = {
    id: mockUserId,
    name: 'Vansh Gupta',
    avatar_url: null,
    avatar_path: null,
    upi_id: 'vansh@okhdfcbank',
    onboarded_at: '2026-10-02T10:00:00Z',
    deleted_at: null,
    created_at: '2026-10-02T10:00:00Z',
    updated_at: '2026-10-02T10:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing profile directly when found in database', async () => {
    const mockMaybeSingle = jest.fn().mockResolvedValue({ data: mockProfile, error: null });
    const mockEq = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

    const result = await fetchProfile(mockUserId);

    expect(result).toEqual(mockProfile);
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('id', mockUserId);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('calls ensure_my_profile RPC when profile row is missing (Case C10)', async () => {
    // Database returns no row (null)
    const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const mockEq = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

    // RPC creates and returns profile
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: mockProfile, error: null });

    const result = await fetchProfile(mockUserId);

    expect(result).toEqual(mockProfile);
    expect(supabase.rpc).toHaveBeenCalledWith('ensure_my_profile');
  });

  it('throws error when database query errors', async () => {
    const dbError = new Error('Database connection failed');
    const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: dbError });
    const mockEq = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

    await expect(fetchProfile(mockUserId)).rejects.toThrow('Database connection failed');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('throws error when ensure_my_profile RPC fails', async () => {
    const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const mockEq = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

    const rpcError = new Error('RPC permission denied');
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: rpcError });

    await expect(fetchProfile(mockUserId)).rejects.toThrow('RPC permission denied');
  });
});
