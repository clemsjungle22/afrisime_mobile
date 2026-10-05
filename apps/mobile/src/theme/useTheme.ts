import { useColorScheme } from 'react-native';
import { darkColors, lightColors, radius, spacing, typography, type Theme } from './tokens';

const lightTheme: Theme = { scheme: 'light', colors: lightColors, spacing, radius, typography };
const darkTheme: Theme = { scheme: 'dark', colors: darkColors, spacing, radius, typography };

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
