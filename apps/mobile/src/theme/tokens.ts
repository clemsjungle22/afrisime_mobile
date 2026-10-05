/**
 * Tokens de design AfriSime, dérivés du vert profond de la marque (#0f3d2e).
 * Accent or chaud et variante sombre : proposition à faire valider par AfriSime.
 */

export const palette = {
  green50: '#e8f3ee',
  green100: '#c6e2d4',
  green200: '#9fceb7',
  green300: '#6fb594',
  green400: '#3f9973',
  green500: '#227f5a',
  green600: '#186848',
  green700: '#13533b',
  green800: '#0f3d2e', // couleur de marque
  green900: '#0a2a20',
  gold400: '#f0b93a',
  gold500: '#e0a526',
  gold600: '#b8841a',
  white: '#ffffff',
  black: '#000000',
} as const;

export type ColorTokens = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textInverse: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;
  accent: string;
  onAccent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  disabled: string;
  onDisabled: string;
  tabInactive: string;
};

export const lightColors: ColorTokens = {
  background: '#f6f8f6',
  surface: palette.white,
  surfaceAlt: '#eef2ef',
  border: '#d9e0db',
  text: '#13201a',
  textMuted: '#55635b',
  textInverse: palette.white,
  primary: palette.green800,
  primaryPressed: palette.green900,
  onPrimary: palette.white,
  primarySoft: palette.green50,
  onPrimarySoft: palette.green800,
  accent: palette.gold500,
  onAccent: '#1a1300',
  success: '#1e7d45',
  warning: '#a35f00',
  error: '#c62828',
  info: '#1565c0',
  disabled: '#dfe4e1',
  onDisabled: '#7d8a83',
  tabInactive: '#6b7a72',
};

export const darkColors: ColorTokens = {
  background: '#0b1410',
  surface: '#121e18',
  surfaceAlt: '#1a2a22',
  border: '#2a3b32',
  text: '#eef3f0',
  textMuted: '#a3b3aa',
  textInverse: '#0b1410',
  primary: palette.green300,
  primaryPressed: palette.green400,
  onPrimary: '#062016',
  primarySoft: '#173a2c',
  onPrimarySoft: palette.green100,
  accent: palette.gold400,
  onAccent: '#1a1300',
  success: '#4cc27e',
  warning: '#f0a43a',
  error: '#ef6b6b',
  info: '#6aa8f0',
  disabled: '#24332b',
  onDisabled: '#6f7f76',
  tabInactive: '#8a9a91',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/** Zone tactile minimale (Android : 48 dp). */
export const minTouchSize = 48;

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export type TypographyVariant = keyof typeof typography;

export type Theme = {
  scheme: 'light' | 'dark';
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
};
