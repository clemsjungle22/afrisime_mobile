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
  cream: '#fbf7ef',
  creamDeep: '#f3ecdd',
  sand: '#e9e1cf',
  gold300: '#f6c978',
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
  /** En-têtes immersifs (dégradé vert profond → vert nuit). */
  heroStart: string;
  heroEnd: string;
  /** Texte et éléments posés sur les en-têtes. */
  onHero: string;
  onHeroMuted: string;
  /** Ombre portée (couleur). */
  shadow: string;
};

export const lightColors: ColorTokens = {
  // Fond crème chaud : fait ressortir le vert profond et l'or, rendu plus premium que le gris.
  background: palette.cream,
  surface: palette.white,
  surfaceAlt: palette.creamDeep,
  border: palette.sand,
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
  skeleton: '#efe8da',
  logoBackground: 'transparent',
  gradientEnd: palette.brand950,
  heroStart: palette.brand800,
  heroEnd: palette.brand950,
  onHero: palette.white,
  onHeroMuted: palette.brand200,
  shadow: '#0a2a20',
};

export const darkColors: ColorTokens = {
  background: '#08130e',
  surface: '#11201a',
  surfaceAlt: '#172b22',
  border: '#243a2f',
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
  skeleton: '#1b2d24',
  logoBackground: palette.brand50,
  gradientEnd: '#050f0b',
  heroStart: '#123d2d',
  heroEnd: '#050f0b',
  onHero: palette.white,
  onHeroMuted: palette.brand200,
  shadow: '#000000',
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
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
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
  hero: { fontFamily: fontFamilies.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  display: { fontFamily: fontFamilies.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  title: { fontFamily: fontFamilies.extrabold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  subtitle: { fontFamily: fontFamilies.bold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 20 },
  price: { fontFamily: fontFamilies.extrabold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  priceLg: { fontFamily: fontFamilies.extrabold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  overline: { fontFamily: fontFamilies.bold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
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
  shadows: ReturnType<typeof shadows>;
};

/**
 * Ombres douces (propriété `boxShadow`, gérée nativement par React Native en nouvelle architecture).
 * Teintées de vert nuit plutôt que de noir pur : plus chaudes, plus « premium ».
 */
export function shadows(color: string) {
  return {
    sm: `0px 2px 8px ${color}14`,
    md: `0px 8px 24px ${color}1f`,
    lg: `0px 16px 40px ${color}2e`,
  } as const;
}

/** Dégradés de la marque. */
export const gradients = {
  brand: [palette.brand800, palette.brand950] as const,
  gold: ['#f2b955', palette.accent600] as const,
  night: ['#123d2d', '#050f0b'] as const,
};

/** Assombrit une couleur #rrggbb (dégradés de rayon, ombres teintées). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Éclaircit une couleur #rrggbb vers le blanc. */
export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v + (255 - v) * amount);
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
