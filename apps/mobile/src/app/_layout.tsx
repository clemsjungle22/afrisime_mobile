import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button, SnackbarHost, Text } from '@/components/ui';
import { useTariffChangeRefresh } from '@/features/auth/hooks';
import { PushSync } from '@/features/notifications/push';
import { bootstrapSession } from '@/features/auth/session';
import { useCartSync } from '@/features/cart/sync';
import { wireFocusManager, wireOnlineManager } from '@/lib/network';
import { persistOptions, queryClient } from '@/lib/queryClient';
import { useTheme } from '@/theme';

// Splash maintenu jusqu'au chargement des polices (évite un saut de typographie).
void SplashScreen.preventAutoHideAsync();
wireOnlineManager();
wireFocusManager();

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        gap: theme.spacing.lg,
        padding: theme.spacing.xl,
        backgroundColor: theme.colors.background,
      }}
    >
      <Text variant="title" align="center">
        Oups, un problème est survenu
      </Text>
      <Text color="textMuted" align="center">
        Votre panier est conservé. Réessayez dans un instant.
      </Text>
      <Button label="Réessayer" onPress={() => void retry()} fullWidth />
    </View>
  );
}

export default function RootLayout() {
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const [sessionReady, setSessionReady] = useState(false);
  const ready = (fontsLoaded || fontError !== null) && sessionReady;

  // Session restaurée depuis le stockage chiffré avant d'afficher l'app (pas d'écran « visiteur » fugace).
  useEffect(() => {
    void bootstrapSession().finally(() => setSessionReady(true));
  }, []);

  useEffect(() => {
    // En cas d'échec des polices, on continue avec la police système plutôt que de bloquer.
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        />
        <CartSync />
        <TariffSync />
        <PushSync />
        <SnackbarHost />
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Prix rechargés quand l'équipe change le tarif du client (sans rendu). */
function TariffSync() {
  useTariffChangeRefresh();
  return null;
}

/** Synchronisation du panier avec le compte (sans rendu). */
function CartSync() {
  useCartSync();
  return null;
}
