import { TextStyle } from 'react-native';
import { DarkTheme, DefaultTheme } from 'expo-router/react-navigation';
import {
  MD3DarkTheme,
  MD3LightTheme,
  MD3Theme,
  adaptNavigationTheme,
  useTheme as usePaperTheme,
} from 'react-native-paper';
import { palette, radius, spacing } from './tokens';

const { LightTheme: navLight, DarkTheme: navDark } = adaptNavigationTheme({
  reactNavigationLight: DefaultTheme as unknown as Parameters<typeof adaptNavigationTheme>[0]['reactNavigationLight'],
  reactNavigationDark: DarkTheme as unknown as Parameters<typeof adaptNavigationTheme>[0]['reactNavigationDark'],
});

export const typography = {
  screenTitle: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: -0.5,
  } as TextStyle,
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  } as TextStyle,
  body: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  } as TextStyle,
  caption: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  } as TextStyle,
  amount: {
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
    letterSpacing: -0.5,
  } as TextStyle,
  amountSmall: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  } as TextStyle,
} as const;

export interface CustomThemeColors {
  owed: string;
  owedContainer: string;
  onOwed: string;
  owe: string;
  oweContainer: string;
  onOwe: string;
  muted: string;
  text: string;
}

const customLightColors: CustomThemeColors = {
  owed: palette.owed,
  owedContainer: palette.owedContainer,
  onOwed: palette.onOwed,
  owe: palette.owe,
  oweContainer: palette.oweContainer,
  onOwe: palette.onOwe,
  muted: palette.light.muted,
  text: palette.light.text,
};

const customDarkColors: CustomThemeColors = {
  owed: '#10B981',
  owedContainer: '#064E3B',
  onOwed: palette.onOwed,
  owe: '#F97316',
  oweContainer: '#7C2D12',
  onOwe: palette.onOwe,
  muted: palette.dark.muted,
  text: palette.dark.text,
};

export interface AppTheme extends MD3Theme {
  colors: MD3Theme['colors'] & CustomThemeColors;
  customColors: CustomThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  isDark: boolean;
}

export const appLightTheme: AppTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...(navLight?.colors ?? {}),
    primary: palette.primary,
    primaryContainer: palette.primaryContainer,
    onPrimary: palette.onPrimary,
    onPrimaryContainer: palette.onPrimaryContainer,
    background: palette.light.background,
    surface: palette.light.surface,
    surfaceVariant: palette.light.surfaceVariant,
    outline: palette.light.outline,
    ...customLightColors,
  },
  customColors: customLightColors,
  spacing,
  radius,
  typography,
  isDark: false,
};

export const appDarkTheme: AppTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...(navDark?.colors ?? {}),
    primary: palette.primary,
    primaryContainer: '#134E4A',
    onPrimary: palette.onPrimary,
    onPrimaryContainer: palette.primaryContainer,
    background: palette.dark.background,
    surface: palette.dark.surface,
    surfaceVariant: palette.dark.surfaceVariant,
    outline: palette.dark.outline,
    ...customDarkColors,
  },
  customColors: customDarkColors,
  spacing,
  radius,
  typography,
  isDark: true,
};

export const navigationLightTheme = {
  ...DefaultTheme,
  ...(navLight ?? {}),
  colors: {
    ...DefaultTheme.colors,
    ...(navLight?.colors ?? {}),
    primary: palette.primary,
    background: palette.light.background,
    card: palette.light.surface,
    text: palette.light.text,
    border: palette.light.outline,
  },
};

export const navigationDarkTheme = {
  ...DarkTheme,
  ...(navDark ?? {}),
  colors: {
    ...DarkTheme.colors,
    ...(navDark?.colors ?? {}),
    primary: palette.primary,
    background: palette.dark.background,
    card: palette.dark.surface,
    text: palette.dark.text,
    border: palette.dark.outline,
  },
};

export const useAppTheme = (): AppTheme => {
  const theme = usePaperTheme();
  return theme as unknown as AppTheme;
};
