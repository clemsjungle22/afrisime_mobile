import { useColorScheme } from 'react-native';
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

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
