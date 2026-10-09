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
      <Stack.Screen name="product/[slug]" options={{ headerShown: false }} />
      <Stack.Screen name="checkout/index" options={{ title: 'Commande' }} />
      <Stack.Screen name="checkout/address" options={{ title: 'Nouvelle adresse' }} />
      <Stack.Screen name="payment/[orderId]" options={{ title: 'Paiement' }} />
      <Stack.Screen name="order-confirmation/[orderId]" options={{ title: 'Commande confirmée' }} />
      <Stack.Screen name="orders/[orderId]" options={{ title: 'Commande' }} />
      <Stack.Screen name="search" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="favoris" options={{ title: 'Mes favoris' }} />
      <Stack.Screen name="listes" options={{ title: 'Mes listes d’achats' }} />
      <Stack.Screen name="listes/[id]" options={{ title: 'Liste' }} />
      <Stack.Screen name="packs" options={{ title: 'Packs Famille' }} />
      <Stack.Screen name="packs/[id]" options={{ title: 'Pack' }} />
      <Stack.Screen name="carnets" options={{ title: 'Mes carnets' }} />
      <Stack.Screen name="carnets/[id]" options={{ title: 'Carnet' }} />
      <Stack.Screen name="avoir" options={{ title: 'Mon avoir' }} />
      <Stack.Screen name="credit" options={{ title: 'Mon crédit' }} />
      <Stack.Screen name="recevoir-pack/[id]" options={{ title: 'Recevoir mon pack' }} />
    </Stack>
  );
}
