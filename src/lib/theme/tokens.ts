export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  card: 12,
  sheet: 16,
  pill: 999,
} as const;

export const layout = {
  minTouchTarget: 48,
} as const;

export const palette = {
  // Brand primary: Calm green / teal
  primary: '#0D9488',
  primaryContainer: '#CCFBF1',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#115E59',

  // Money tokens
  owed: '#059669', // Green: Money owed to you (positive)
  owedContainer: '#D1FAE5',
  onOwed: '#FFFFFF',

  owe: '#EA580C', // Orange: Money you owe (negative)
  oweContainer: '#FFEDD5',
  onOwe: '#FFFFFF',

  // Semantic neutrals & accents
  error: '#DC2626',
  errorContainer: '#FEE2E2',
  onError: '#FFFFFF',

  // Light neutrals
  light: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceVariant: '#F1F5F9',
    outline: '#CBD5E1',
    text: '#0F172A',
    muted: '#64748B',
  },

  // Dark neutrals
  dark: {
    background: '#0F172A',
    surface: '#1E293B',
    surfaceVariant: '#334155',
    outline: '#475569',
    text: '#F8FAFC',
    muted: '#94A3B8',
  },
} as const;
