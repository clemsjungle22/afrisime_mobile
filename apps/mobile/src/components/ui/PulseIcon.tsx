import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, type ComponentProps } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

function Ring({ delay, size, color }: { delay: number; size: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(t);
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - t.value),
    transform: [{ scale: 1 + t.value * 0.9 }],
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color }, style]}
    />
  );
}

/** Icône entourée d'ondes qui pulsent (attente d'une action sur le téléphone). */
export function PulseIcon({ icon, size = 96 }: { icon: ComponentProps<typeof Ionicons>['name']; size?: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <View
      style={{ width: size * 2, height: size * 2, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {reduceMotion ? null : (
        <>
          <Ring delay={0} size={size} color={theme.colors.accent} />
          <Ring delay={1000} size={size} color={theme.colors.accent} />
        </>
      )}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.primary,
          boxShadow: theme.shadows.lg,
        }}
      >
        <Ionicons name={icon} size={size * 0.46} color={theme.colors.onPrimary} />
      </View>
    </View>
  );
}
