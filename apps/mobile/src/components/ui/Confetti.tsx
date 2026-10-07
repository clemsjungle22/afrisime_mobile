import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { palette } from '@/theme';

const COLORS = [palette.accent500, palette.brand600, palette.gold300, palette.brand900, '#ffffff', '#c2791b'];
const COUNT = 36;

type Piece = { x: number; delay: number; duration: number; size: number; color: string; drift: number; spin: number; round: boolean };

function ConfettiPiece({ piece, height }: { piece: Piece; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(piece.delay, withTiming(1, { duration: piece.duration, easing: Easing.out(Easing.quad) }));
  }, [piece, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.85 ? 1 : (1 - t.value) / 0.15,
    transform: [
      { translateY: -40 + t.value * (height + 80) },
      { translateX: Math.sin(t.value * Math.PI * 2) * piece.drift },
      { rotate: `${t.value * piece.spin}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: piece.x,
          top: 0,
          width: piece.size,
          height: piece.round ? piece.size : piece.size * 0.45,
          borderRadius: piece.round ? piece.size : 2,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

function makePieces(width: number): Piece[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    x: Math.random() * width,
    delay: Math.random() * 500,
    duration: 2200 + Math.random() * 1400,
    size: 7 + Math.random() * 7,
    color: COLORS[i % COLORS.length]!,
    drift: 12 + Math.random() * 28,
    spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
    round: i % 4 === 0,
  }));
}

/** Pluie de confettis aux couleurs AfriSime, jouée une fois (absente si « Réduire les animations »). */
export function Confetti() {
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  // Tirage aléatoire une seule fois, à l'initialisation de l'état (rendus suivants purs).
  const [pieces] = useState<Piece[]>(() => makePieces(width));
  if (reduceMotion) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} piece={p} height={height} />
      ))}
    </View>
  );
}
