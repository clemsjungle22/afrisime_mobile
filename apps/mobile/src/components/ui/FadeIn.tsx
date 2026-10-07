import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

type Props = {
  children: ReactNode;
  /** Rang dans la cascade (chaque rang décale l'apparition de 70 ms). */
  index?: number;
  style?: StyleProp<ViewStyle>;
};

/** Apparition douce en cascade (désactivée si « Réduire les animations » est actif). */
export function FadeIn({ children, index = 0, style }: Props) {
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.duration(420)
        .delay(Math.min(index, 8) * 70)
        .springify()
        .damping(18)
        .reduceMotion(ReduceMotion.System)}
    >
      {children}
    </Animated.View>
  );
}
