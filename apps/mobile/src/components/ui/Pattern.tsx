import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern as SvgPattern, Rect } from 'react-native-svg';

type Props = {
  color?: string;
  /** Opacité globale du motif (discret par défaut : c'est une signature, pas un décor chargé). */
  opacity?: number;
  /** Taille d'un motif élémentaire. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Motif géométrique inspiré du kente et du wax : losange central, chevrons, points.
 * Vectoriel et répété : aucun poids d'image, net sur tous les écrans.
 */
export function Pattern({ color = '#ffffff', opacity = 0.08, size = 36, style }: Props) {
  const id = `afs-pattern-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const s = size;
  const h = s / 2;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }, style]} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%">
        <Defs>
          <SvgPattern id={id} width={s} height={s} patternUnits="userSpaceOnUse">
            {/* Losange central */}
            <Path d={`M${h} ${s * 0.18} L${s * 0.82} ${h} L${h} ${s * 0.82} L${s * 0.18} ${h} Z`} stroke={color} strokeWidth={1.4} fill="none" />
            <Path d={`M${h} ${s * 0.34} L${s * 0.66} ${h} L${h} ${s * 0.66} L${s * 0.34} ${h} Z`} fill={color} />
            {/* Chevrons en bordure (bandes de tissage) */}
            <Path d={`M0 ${s * 0.06} L${s * 0.12} 0 L${s * 0.24} ${s * 0.06}`} stroke={color} strokeWidth={1.2} fill="none" />
            <Path d={`M${s * 0.76} ${s * 0.94} L${s * 0.88} ${s} L${s} ${s * 0.94}`} stroke={color} strokeWidth={1.2} fill="none" />
            {/* Points aux angles */}
            <Circle cx={0} cy={0} r={1.6} fill={color} />
            <Circle cx={s} cy={0} r={1.6} fill={color} />
            <Circle cx={0} cy={s} r={1.6} fill={color} />
            <Circle cx={s} cy={s} r={1.6} fill={color} />
          </SvgPattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
