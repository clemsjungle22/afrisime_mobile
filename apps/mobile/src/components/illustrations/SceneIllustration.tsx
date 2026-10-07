import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { palette, useTheme } from '@/theme';
import { ProductIllustration } from './ProductIllustration';

export type SceneKind = 'cart' | 'orders' | 'search' | 'offline' | 'welcome';

type Props = {
  kind: SceneKind;
  size?: number;
};

/** Panier tressé vide (vue de face), aux couleurs AfriSime. */
function Basket({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx={50} cy={90} rx={34} ry={4.5} fill="#000" opacity={0.15} />
      <Path d="M28 42 C28 20 72 20 72 42" stroke={palette.brand800} strokeWidth={5} fill="none" strokeLinecap="round" />
      <Path d="M16 44 H84 L77 86 C76.4 88.5 74.5 90 72 90 H28 C25.5 90 23.6 88.5 23 86 Z" fill="#d9a35b" />
      <Path d="M16 44 H84 L83 50 H17 Z" fill="#b97f36" />
      {[30, 42, 54, 66].map((x) => (
        <Path key={x} d={`M${x} 52 L${x + 2} 86`} stroke="#b97f36" strokeWidth={2.2} />
      ))}
      {[60, 70, 80].map((y) => (
        <Path key={y} d={`M${20 + (y - 50) * 0.12} ${y} H${80 - (y - 50) * 0.12}`} stroke="#c89048" strokeWidth={2} />
      ))}
      <Rect x={12} y={40} width={76} height={7} rx={3.5} fill={palette.brand900} />
      <Path d="M34 46 L42 46" stroke={palette.accent500} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

/** Ticket de caisse avec coche. */
function Receipt({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx={50} cy={92} rx={26} ry={4} fill="#000" opacity={0.15} />
      <Path d="M26 10 H74 V86 L68 82 L62 86 L56 82 L50 86 L44 82 L38 86 L32 82 L26 86 Z" fill="#ffffff" />
      <Path d="M26 10 H74 V18 H26 Z" fill={palette.brand900} />
      {[30, 38, 46, 54].map((y, i) => (
        <G key={y}>
          <Rect x={33} y={y} width={i % 2 ? 22 : 28} height={3.4} rx={1.7} fill="#d7d2c6" />
          <Rect x={60} y={y} width={8} height={3.4} rx={1.7} fill="#d7d2c6" />
        </G>
      ))}
      <Rect x={33} y={63} width={35} height={2} rx={1} fill="#e9e1cf" />
      <Rect x={33} y={69} width={18} height={4} rx={2} fill={palette.brand900} />
      <Rect x={56} y={69} width={12} height={4} rx={2} fill={palette.accent500} />
      <Circle cx={74} cy={74} r={13} fill={palette.accent500} />
      <Path d="M68 74 L72.5 78.5 L80.5 70" stroke={palette.brand950} strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Loupe. */
function Magnifier({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M64 64 L84 84" stroke={palette.brand900} strokeWidth={10} strokeLinecap="round" />
      <Circle cx={44} cy={44} r={26} fill="#ffffff" opacity={0.55} stroke={palette.brand900} strokeWidth={7} />
      <Path d="M30 38 C32 30 38 26 45 25" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** Nuage barré (hors connexion). */
function Cloud({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M28 74 C16 74 12 62 18 55 C20 44 32 40 40 45 C44 32 66 30 72 44 C84 44 90 54 86 63 C84 70 78 74 72 74 Z"
        fill="#ffffff"
      />
      <Path d="M24 22 L78 84" stroke={palette.accent500} strokeWidth={7} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Scènes illustrées des états vides et des écrans d'accueil : un grand rond pastel, un objet
 * principal et quelques produits AfriSime autour (même famille visuelle que les cartes).
 */
export const SceneIllustration = memo(function SceneIllustration({ kind, size = 200 }: Props) {
  const theme = useTheme();
  const main = size * 0.62;
  const side = size * 0.34;

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          position: 'absolute',
          width: size * 0.86,
          height: size * 0.86,
          borderRadius: size,
          backgroundColor: theme.scheme === 'dark' ? theme.colors.surfaceAlt : theme.colors.accentSoft,
        }}
      />
      <View style={{ position: 'absolute', top: size * 0.06, left: size * 0.02, transform: [{ rotate: '-14deg' }], zIndex: 1 }}>
        <ProductIllustration kind={kind === 'orders' ? 'box' : 'bottle'} color="#1f6f8b" size={side} />
      </View>
      <View style={{ position: 'absolute', bottom: size * 0.04, right: size * 0.0, transform: [{ rotate: '10deg' }], zIndex: 1 }}>
        <ProductIllustration kind={kind === 'search' ? 'sack' : 'jar'} color="#4f8a2b" size={side} />
      </View>
      <View style={{ zIndex: 2 }}>
        {kind === 'cart' || kind === 'welcome' ? (
          <Basket size={main} />
        ) : kind === 'orders' ? (
          <Receipt size={main} />
        ) : kind === 'search' ? (
          <Magnifier size={main} />
        ) : (
          <Cloud size={main} />
        )}
      </View>
    </View>
  );
});
