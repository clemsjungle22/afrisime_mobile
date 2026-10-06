/**
 * Tokens de design AfriSime, repris du site web (afrisime-site-kappa.vercel.app).
 * Le site n'a pas de mode sombre : la variante sombre est dérivée de la même palette.
 */

/** Palette brute du site (variables CSS --color-*). */
export const palette = {
  brand50: '#f2f8f4',
  brand100: '#e3efe8',
  brand200: '#c6e0d2',
  brand600: '#2e7d5b',
  brand700: '#1b6247',
  brand800: '#14503b',
  brand900: '#0f3d2e', // couleur de marque
  brand950: '#0a2a20',
  accent100: '#fbeed6',
  accent500: '#e8a33d',
  accent600: '#c9811a',
  canvas: '#f7f9f8',
  ink: '#17221d',
  muted: '#56665f',
  line: '#dbe4df',
  danger: '#b42318',
  danger50: '#fdecea',
  warning: '#9a6200',
  warning50: '#fff4dc',
  info: '#1f5f8b',
  info50: '#e7f1f8',
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
  accentSoft: string;
  onAccentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  errorSoft: string;
  info: string;
  infoSoft: string;
  disabled: string;
  onDisabled: string;
  tabInactive: string;
  skeleton: string;
  /** Fond derrière le logo (le logo est vert sur transparent). */
  logoBackground: string;
  /** Fin des dégradés de rayon (comme le site). */
  gradientEnd: string;
};

export const lightColors: ColorTokens = {
  background: palette.canvas,
  surface: palette.white,
  surfaceAlt: palette.brand50,
  border: palette.line,
  text: palette.ink,
  textMuted: palette.muted,
  textInverse: palette.white,
  primary: palette.brand900,
  primaryPressed: palette.brand950,
  onPrimary: palette.white,
  primarySoft: palette.brand50,
  onPrimarySoft: palette.brand700,
  accent: palette.accent500,
  onAccent: palette.brand950,
  accentSoft: palette.accent100,
  onAccentSoft: '#7a4a08',
  success: palette.brand600,
  successSoft: palette.brand100,
  warning: palette.warning,
  warningSoft: palette.warning50,
  error: palette.danger,
  errorSoft: palette.danger50,
  info: palette.info,
  infoSoft: palette.info50,
  disabled: '#e4eae6',
  onDisabled: '#7d8a83',
  tabInactive: palette.muted,
  skeleton: '#e6ece8',
  logoBackground: 'transparent',
  gradientEnd: palette.brand950,
};

export const darkColors: ColorTokens = {
  background: '#0b1712',
  surface: '#12211a',
  surfaceAlt: '#183026',
  border: '#27392f',
  text: '#eef4f0',
  textMuted: '#a5b5ad',
  textInverse: palette.brand950,
  primary: palette.brand200,
  primaryPressed: palette.brand100,
  onPrimary: palette.brand950,
  primarySoft: '#183a2c',
  onPrimarySoft: palette.brand200,
  accent: palette.accent500,
  onAccent: palette.brand950,
  accentSoft: '#3a2a10',
  onAccentSoft: '#f5c87e',
  success: '#5fbf8f',
  successSoft: '#173a2c',
  warning: '#f0b54a',
  warningSoft: '#3a2c10',
  error: '#f07a6e',
  errorSoft: '#3d1a17',
  info: '#79b4dc',
  infoSoft: '#142c3d',
  disabled: '#22332a',
  onDisabled: '#6f8077',
  tabInactive: '#8fa198',
  skeleton: '#1e3128',
  logoBackground: palette.brand50,
  gradientEnd: '#050f0b',
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

/** Plus Jakarta Sans (police du site), une famille par graisse : fiable sur Android. */
export const fontFamilies = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const typography = {
  display: { fontFamily: fontFamilies.extrabold, fontSize: 28, lineHeight: 34 },
  title: { fontFamily: fontFamilies.bold, fontSize: 22, lineHeight: 28 },
  subtitle: { fontFamily: fontFamilies.bold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 20 },
  price: { fontFamily: fontFamilies.extrabold, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: fontFamilies.medium, fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: fontFamilies.semibold, fontSize: 11, lineHeight: 14 },
} as const;

export type TypographyVariant = keyof typeof typography;

export type Theme = {
  scheme: 'light' | 'dark';
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
};
