import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { palette } from '@/theme';

/** Grande coche qui « éclot » (ressort) avec un anneau qui se propage. */
export function SuccessMark({ size = 112 }: { size?: number }) {
  const reduceMotion = useReducedMotion();
  const pop = useSharedValue(reduceMotion ? 1 : 0);
  const ring = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    pop.value = withSpring(1, { damping: 9, stiffness: 160 });
    ring.value = withDelay(150, withTiming(1, { duration: 900 }));
  }, [pop, ring, reduceMotion]);

  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - ring.value,
    transform: [{ scale: 1 + ring.value * 0.7 }],
  }));

  return (
    <View style={{ width: size * 1.7, height: size * 1.7, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          { position: 'absolute', width: size, height: size, borderRadius: size, borderWidth: 3, borderColor: palette.accent500 },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.accent500,
            boxShadow: `0px 12px 32px ${palette.accent600}66`,
          },
          markStyle,
        ]}
      >
        <Ionicons name="checkmark" size={size * 0.58} color={palette.brand950} />
      </Animated.View>
    </View>
  );
}
