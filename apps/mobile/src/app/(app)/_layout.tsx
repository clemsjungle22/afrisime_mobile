import { Stack } from 'expo-router';
import { fontFamilies, useTheme } from '@/theme';

/** Zone principale de l'app. La garde de session (redirection vers l'auth) sera ajoutée ici. */
export default function AppLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.primary,
        headerTitleStyle: { fontFamily: fontFamilies.bold, color: theme.colors.text },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[slug]" options={{ title: '' }} />
      <Stack.Screen name="checkout/index" options={{ title: 'Commande' }} />
      <Stack.Screen name="checkout/address" options={{ title: 'Nouvelle adresse' }} />
      <Stack.Screen name="search" options={{ headerShown: false, animation: 'fade' }} />
    </Stack>
  );
}
