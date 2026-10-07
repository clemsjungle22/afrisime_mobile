import { darkColors, lightColors, radius, shadows, spacing, typography, type Theme } from './tokens';

const lightTheme: Theme = {
  scheme: 'light',
  colors: lightColors,
  spacing,
  radius,
  typography,
  shadows: shadows(lightColors.shadow),
};
const darkTheme: Theme = {
  scheme: 'dark',
  colors: darkColors,
  spacing,
  radius,
  typography,
  shadows: shadows(darkColors.shadow),
};

/**
 * Mode CLAIR uniquement : la charte AfriSime, ce sont les couleurs du logo (vert profond + or
 * sur fond clair). Le thème sombre reste défini (darkTheme) pour une éventuelle réactivation :
 * il suffira de revenir à `useColorScheme() === 'dark' ? darkTheme : lightTheme`.
 */
export function useTheme(): Theme {
  return lightTheme;
}

/** Thème sombre conservé, non utilisé (voir useTheme). */
export const unusedDarkTheme = darkTheme;
