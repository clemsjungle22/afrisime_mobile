import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type DimensionValue, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

type Props = {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** Bloc de chargement avec reflet lumineux qui balaie (animé hors du fil JS). */
export function Skeleton({ width = '100%', height = 16, radius, style }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || w === 0) return;
    x.value = 0;
    x.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(x);
  }, [reduceMotion, w, x]);

  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: -w + x.value * w * 2 }] }));
  const highlight = theme.scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.65)';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={[
        { width, height, borderRadius: radius ?? theme.radius.sm, backgroundColor: theme.colors.skeleton, overflow: 'hidden' },
        style,
      ]}
    >
      {w > 0 && !reduceMotion ? (
        <Animated.View style={[StyleSheet.absoluteFill, { width: w }, sweep]}>
          <LinearGradient
            colors={['transparent', highlight, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
