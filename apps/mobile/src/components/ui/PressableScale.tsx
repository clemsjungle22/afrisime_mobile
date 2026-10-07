import { forwardRef } from 'react';
import { Pressable, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Échelle au toucher (0.97 par défaut : sensible sans être mou). */
  pressedScale?: number;
};

/**
 * Pressable qui « s'enfonce » légèrement sous le doigt (ressort calculé hors du fil JS).
 * Respecte « Réduire les animations » du système.
 */
export const PressableScale = forwardRef<View, Props>(function PressableScale(
  { style, pressedScale = 0.97, onPressIn, onPressOut, ...rest },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      ref={ref}
      onPressIn={(e) => {
        if (!reduceMotion) scale.value = withSpring(pressedScale, { damping: 18, stiffness: 420 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 300 });
        onPressOut?.(e);
      }}
      style={[style, animated]}
      {...rest}
    />
  );
});
