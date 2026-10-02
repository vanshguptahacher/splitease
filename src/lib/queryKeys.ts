/**
 * Centralized React Query Key Factory.
 * Enforces consistent query invalidation, caching, and key shapes across all phases.
 */

export const queryKeys = {
  // Auth & Profile keys
  auth: {
    session: ['auth', 'session'] as const,
    user: ['auth', 'user'] as const,
  },
  profile: (userId?: string) => ['profile', userId] as const,

  // Group keys
  groups: {
    all: ['groups'] as const,
    detail: (groupId: string) => ['groups', groupId] as const,
    members: (groupId: string) => ['groups', groupId, 'members'] as const,
    expenses: (groupId: string) => ['groups', groupId, 'expenses'] as const,
    balances: (groupId: string) => ['groups', groupId, 'balances'] as const,
    settlements: (groupId: string) => ['groups', groupId, 'settlements'] as const,
  },

  // Expense keys
  expenses: {
    detail: (expenseId: string) => ['expenses', expenseId] as const,
  },

  // Activity keys
  activity: {
    all: ['activity'] as const,
    byGroup: (groupId: string) => ['activity', 'group', groupId] as const,
  },

  // Invite keys
  invites: {
    detail: (code: string) => ['invites', code] as const,
  },
} as const;
