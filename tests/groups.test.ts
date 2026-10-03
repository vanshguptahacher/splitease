import {
  createGroup,
  deleteGroup,
  deleteMyAccount,
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
import { supabase } from '@/lib/supabase/client';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

describe('Groups API Layer (Sub-phase 3.5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createGroup calls create_group RPC and returns group', async () => {
    const mockGroup = {
      id: 'g-1',
      name: 'Goa Trip',
      currency: 'INR',
      created_by: 'u-1',
      client_request_id: 'req-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: mockGroup, error: null });

    const result = await createGroup('Goa Trip', 'req-1');
    expect(supabase.rpc).toHaveBeenCalledWith('create_group', {
      p_name: 'Goa Trip',
      p_client_request_id: 'req-1',
    });
    expect(result).toEqual(mockGroup);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('createGroup throws error when RPC returns an error', async () => {
    const mockErr = new Error('group_limit_reached');
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: null, error: mockErr });

    await expect(createGroup('51st Group', 'req-2')).rejects.toThrow('group_limit_reached');
  });

  it('listMyGroups calls list_my_groups RPC and returns list', async () => {
    const mockList = [
      {
        group_id: 'g-1',
        name: 'Goa Trip',
        my_role: 'admin',
        member_count: 3,
        joined_at: new Date().toISOString(),
      },
    ];
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: mockList, error: null });

    const result = await listMyGroups();
    expect(supabase.rpc).toHaveBeenCalledWith('list_my_groups');
    expect(result).toEqual(mockList);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('getGroup calls get_group RPC and returns detail', async () => {
    const mockDetail = {
      id: 'g-1',
      name: 'Goa Trip',
      currency: 'INR',
      created_by: 'u-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      my_role: 'admin',
      member_count: 3,
    };
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: [mockDetail], error: null });

    const result = await getGroup('g-1');
    expect(supabase.rpc).toHaveBeenCalledWith('get_group', { p_group: 'g-1' });
    expect(result).toEqual(mockDetail);
  });

  it('getGroup throws not_a_member when empty array returned', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: [], error: null });

    await expect(getGroup('g-missing')).rejects.toThrow('not_a_member');
  });

  it('getGroupMembers calls get_group_members RPC with includeFormer param', async () => {
    const mockMembers = [
      {
        user_id: 'u-1',
        name: 'Alice',
        avatar_path: null,
        avatar_url: null,
        upi_id: 'alice@okhdfc',
        role: 'admin',
        status: 'active',
        joined_at: new Date().toISOString(),
      },
    ];
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: mockMembers, error: null });

    const result = await getGroupMembers('g-1', true);
    expect(supabase.rpc).toHaveBeenCalledWith('get_group_members', {
      p_group: 'g-1',
      p_include_former: true,
    });
    expect(result).toEqual(mockMembers);
  });

  it('renameGroup calls rename_group RPC', async () => {
    const mockRenamed = { id: 'g-1', name: 'Goa Trip 2026' };
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: mockRenamed, error: null });

    const result = await renameGroup('g-1', 'Goa Trip 2026');
    expect(supabase.rpc).toHaveBeenCalledWith('rename_group', {
      p_group: 'g-1',
      p_name: 'Goa Trip 2026',
    });
    expect(result).toEqual(mockRenamed);
  });

  it('getOrCreateInvite calls get_or_create_invite RPC', async () => {
    const mockInvite = { code: 'ABC23456', expires_at: new Date().toISOString() };
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: [mockInvite], error: null });

    const result = await getOrCreateInvite('g-1');
    expect(supabase.rpc).toHaveBeenCalledWith('get_or_create_invite', { p_group: 'g-1' });
    expect(result).toEqual(mockInvite);
  });

  it('resetInvite calls reset_invite RPC', async () => {
    const mockInvite = { code: 'XYZ78923', expires_at: new Date().toISOString() };
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: [mockInvite], error: null });

    const result = await resetInvite('g-1');
    expect(supabase.rpc).toHaveBeenCalledWith('reset_invite', { p_group: 'g-1' });
    expect(result).toEqual(mockInvite);
  });

  it('previewInvite calls preview_invite RPC', async () => {
    const mockPreview = {
      status: 'ok',
      group_name: 'Trek Group',
      member_count: 5,
      inviter_name: 'Alice',
    };
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: [mockPreview], error: null });

    const result = await previewInvite('ABC23456');
    expect(supabase.rpc).toHaveBeenCalledWith('preview_invite', { p_code: 'ABC23456' });
    expect(result).toEqual(mockPreview);
  });

  it('joinGroup calls join_group RPC', async () => {
    const mockJoin = {
      r_status: 'joined',
      r_group_id: 'g-1',
      r_group_name: 'Trek Group',
    };
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: [mockJoin], error: null });

    const result = await joinGroup('ABC23456');
    expect(supabase.rpc).toHaveBeenCalledWith('join_group', { p_code: 'ABC23456' });
    expect(result).toEqual(mockJoin);
  });

  it('setMemberRole calls set_member_role RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null });

    await setMemberRole('g-1', 'u-2', 'admin');
    expect(supabase.rpc).toHaveBeenCalledWith('set_member_role', {
      p_group: 'g-1',
      p_user: 'u-2',
      p_role: 'admin',
    });
  });

  it('removeMember calls remove_member RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null });

    await removeMember('g-1', 'u-2');
    expect(supabase.rpc).toHaveBeenCalledWith('remove_member', {
      p_group: 'g-1',
      p_user: 'u-2',
    });
  });

  it('leaveGroup calls leave_group RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: 'left', error: null });

    const res = await leaveGroup('g-1');
    expect(supabase.rpc).toHaveBeenCalledWith('leave_group', { p_group: 'g-1' });
    expect(res).toBe('left');
  });

  it('deleteGroup calls delete_group RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null });

    await deleteGroup('g-1');
    expect(supabase.rpc).toHaveBeenCalledWith('delete_group', { p_group: 'g-1' });
  });

  it('getAccountDeletionBlockers calls account_deletion_blockers RPC', async () => {
    const mockBlockers = {
      sole_admin_groups: [{ id: 'g-1', name: 'Solo Admin' }],
      unsettled_groups: [],
    };
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: mockBlockers, error: null });

    const result = await getAccountDeletionBlockers();
    expect(supabase.rpc).toHaveBeenCalledWith('account_deletion_blockers');
    expect(result).toEqual(mockBlockers);
  });

  it('deleteMyAccount calls delete_my_account RPC without parameters', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null });

    await deleteMyAccount();
    expect(supabase.rpc).toHaveBeenCalledWith('delete_my_account');
  });

  it('never uses direct table writes (.insert, .update, .delete) on groups or group_members', () => {
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
