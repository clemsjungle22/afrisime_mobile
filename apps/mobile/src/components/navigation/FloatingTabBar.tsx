import Ionicons from '@expo/vector-icons/Ionicons';
import type { Tabs } from 'expo-router';
import { useEffect, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { useCartCount } from '@/features/cart/store';
import { haptics } from '@/lib/haptics';
import { palette, useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
/** Props de la barre d'onglets, déduites d'expo-router (pas d'import interne fragile). */
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['home', 'home-outline'],
  boutique: ['storefront', 'storefront-outline'],
  panier: ['cart', 'cart-outline'],
  commandes: ['receipt', 'receipt-outline'],
  compte: ['person', 'person-outline'],
};

/** Hauteur réservée en bas des écrans d'onglets (barre flottante + marge). */
export const FLOATING_TAB_BAR_SPACE = 96;

/** Badge du panier qui « rebondit » à chaque ajout. */
function CartBadge({ count }: { count: number }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (count > 0 && !reduceMotion) {
      scale.value = withSequence(withTiming(1.35, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 260 }));
    }
  }, [count, reduceMotion, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  if (count <= 0) return null;
  return (
    <Animated.View style={[styles.badge, style]}>
      <Text variant="micro" style={{ color: palette.brand950, fontSize: 10.5 }} maxFontSizeMultiplier={1.1}>
        {count > 99 ? '99+' : count}
      </Text>
    </Animated.View>
  );
}

function TabItem({
  route,
  label,
  focused,
  onPress,
  onLongPress,
  cartCount,
}: {
  route: string;
  label: string;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  cartCount: number;
}) {
  const theme = useTheme();
  const progress = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, { damping: 18, stiffness: 220 });
  }, [focused, progress]);

  const pill = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: 0.6 + progress.value * 0.4 }],
  }));

  const [active, inactive] = ICONS[route] ?? ['ellipse', 'ellipse-outline'];
  const color = focused ? theme.colors.primary : theme.colors.tabInactive;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={route === 'panier' && cartCount > 0 ? `${label}, ${cartCount} article${cartCount > 1 ? 's' : ''}` : label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.item}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.pill, { backgroundColor: theme.colors.primarySoft }, pill]} />
      <View>
        <Ionicons name={focused ? active : inactive} size={23} color={color} />
        {route === 'panier' ? <CartBadge count={cartCount} /> : null}
      </View>
      <Text variant="micro" style={{ color, fontSize: 11 }} numberOfLines={1} maxFontSizeMultiplier={1.15}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Barre d'onglets flottante : coins arrondis, ombre douce, pastille animée sous l'onglet actif. */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const cartCount = useCartCount();

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.xl,
            boxShadow: theme.shadows.lg,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const options = descriptors[route.key]?.options;
          const label = typeof options?.title === 'string' ? options.title : route.name;
          return (
            <TabItem
              key={route.key}
              route={route.name}
              label={label}
              focused={focused}
              cartCount={cartCount}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  haptics.select();
                  navigation.navigate(route.name, route.params);
                }
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
  },
  bar: {
    flexDirection: 'row',
    padding: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 56,
  },
  pill: {
    borderRadius: 18,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -11,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent500,
    borderWidth: 2,
    borderColor: palette.white,
  },
});
