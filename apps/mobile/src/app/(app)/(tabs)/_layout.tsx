import { Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/navigation/FloatingTabBar';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="boutique" options={{ title: 'Boutique' }} />
      <Tabs.Screen name="panier" options={{ title: 'Panier' }} />
      <Tabs.Screen name="commandes" options={{ title: 'Commandes' }} />
      <Tabs.Screen name="compte" options={{ title: 'Compte' }} />
    </Tabs>
  );
}
