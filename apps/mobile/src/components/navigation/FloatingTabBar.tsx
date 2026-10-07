import Ionicons from '@expo/vector-icons/Ionicons';
import type { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
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

const BAR_PADDING = 6;
/** Ressort de la pastille : vif, avec un léger dépassement (sensation « organique »). */
const SLIDE_SPRING = { damping: 17, stiffness: 190, mass: 0.9 } as const;

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
  index,
  position,
  onPress,
  onLongPress,
  cartCount,
  focused,
}: {
  route: string;
  label: string;
  index: number;
  /** Position animée de la pastille (en index d'onglet, fractionnaire pendant le glissement). */
  position: SharedValue<number>;
  onPress: () => void;
  onLongPress: () => void;
  cartCount: number;
  focused: boolean;
}) {
  const theme = useTheme();
  const [active, inactive] = ICONS[route] ?? ['ellipse', 'ellipse-outline'];

  // L'icône grossit et remonte à mesure que la pastille arrive dessus.
  const iconStyle = useAnimatedStyle(() => {
    const p = Math.max(0, 1 - Math.abs(position.value - index));
    return {
      transform: [{ translateY: interpolate(p, [0, 1], [0, -1.5]) }, { scale: interpolate(p, [0, 1], [1, 1.12]) }],
    };
  });

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
      <Animated.View style={iconStyle}>
        <Ionicons name={focused ? active : inactive} size={23} color={color} />
        {route === 'panier' ? <CartBadge count={cartCount} /> : null}
      </Animated.View>
      <Text variant="micro" style={{ color, fontSize: 11 }} numberOfLines={1} maxFontSizeMultiplier={1.15}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Barre d'onglets flottante : une seule pastille GLISSE d'un onglet à l'autre (ressort),
 * l'icône active grossit à son arrivée. Respecte « Réduire les animations ».
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const cartCount = useCartCount();
  const reduceMotion = useReducedMotion();
  const [barWidth, setBarWidth] = useState(0);
  const count = state.routes.length;
  const tabWidth = barWidth > 0 ? (barWidth - BAR_PADDING * 2) / count : 0;

  const position = useSharedValue(state.index);
  useEffect(() => {
    position.value = reduceMotion ? state.index : withSpring(state.index, SLIDE_SPRING);
  }, [state.index, reduceMotion, position]);

  const pillStyle = useAnimatedStyle(() => ({
    width: tabWidth,
    transform: [{ translateX: position.value * tabWidth }],
  }));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View
        onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
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
        {tabWidth > 0 ? (
          <Animated.View pointerEvents="none" style={[styles.pill, pillStyle]}>
            <View style={[styles.pillInner, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.border }]} />
          </Animated.View>
        ) : null}
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const options = descriptors[route.key]?.options;
          const label = typeof options?.title === 'string' ? options.title : route.name;
          return (
            <TabItem
              key={route.key}
              route={route.name}
              label={label}
              index={index}
              position={position}
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
    padding: BAR_PADDING,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    position: 'absolute',
    top: BAR_PADDING,
    bottom: BAR_PADDING,
    left: BAR_PADDING,
    paddingHorizontal: 2,
  },
  pillInner: {
    flex: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 56,
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
