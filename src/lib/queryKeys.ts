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
    detail: (groupId: string) => ['group', groupId] as const,
    members: (groupId: string) => ['group', groupId, 'members'] as const,
    invite: (groupId: string) => ['group', groupId, 'invite'] as const,
    expenses: (groupId: string) => ['group', groupId, 'expenses'] as const,
    balances: (groupId: string) => ['group', groupId, 'balances'] as const,
    settlements: (groupId: string) => ['group', groupId, 'settlements'] as const,
  },

  // Balance summary across groups (home overview)
  balanceSummary: ['balanceSummary'] as const,

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
