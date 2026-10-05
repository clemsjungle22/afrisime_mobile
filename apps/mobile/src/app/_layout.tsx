import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button, Text } from '@/components/ui';
import { queryClient } from '@/lib/queryClient';
import { useTheme } from '@/theme';

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
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
