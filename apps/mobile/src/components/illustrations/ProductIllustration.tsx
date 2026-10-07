import { memo } from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { shade, tint } from '@/theme';

export type PackagingKind =
  | 'sack'
  | 'bottle'
  | 'jerrycan'
  | 'pack'
  | 'can'
  | 'bar'
  | 'sachet'
  | 'jar'
  | 'box'
  | 'packet';

const KIND_BY_WORD: Record<string, PackagingKind> = {
  sac: 'sack',
  bouteille: 'bottle',
  bidon: 'jerrycan',
  fardeau: 'pack',
  pack: 'pack',
  boîte: 'can',
  boite: 'can',
  canette: 'can',
  barre: 'bar',
  morceau: 'bar',
  unité: 'bar',
  sachet: 'sachet',
  pot: 'jar',
  carton: 'box',
  paquet: 'packet',
};

/** Type d'illustration à partir du conditionnement (« sac ») ou du libellé (« Sac 5 kg »). */
export function packagingKind(packagingOrLabel: string): PackagingKind {
  const word = packagingOrLabel.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return KIND_BY_WORD[word] ?? 'sack';
}

type Props = {
  kind: PackagingKind;
  /** Couleur du rayon : étiquettes et liquides. */
  color: string;
  size: number;
};

const CREAM = '#f4e9d2';
const CREAM_SHADE = '#e3d2ae';
const WHITE = '#ffffff';

/**
 * Illustrations vectorielles des conditionnements (sac, bouteille, bidon…), teintées par rayon.
 * Remplacent les photos tant qu'AfriSime ne les fournit pas : légères, nettes, cohérentes.
 */
export const ProductIllustration = memo(function ProductIllustration({ kind, color, size }: Props) {
  const deep = shade(color, 0.35);
  const light = tint(color, 0.72);
  const liquid = tint(color, 0.12);

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx={50} cy={91} rx={27} ry={4.5} fill="#000" opacity={0.18} />
      {kind === 'sack' ? (
        <G>
          <Path d="M27 34 C22 50 20 70 22 84 C23 88 26 90 30 90 L70 90 C74 90 77 88 78 84 C80 70 78 50 73 34 Z" fill={CREAM} />
          <Path d="M61 34 L73 34 C78 50 80 70 78 84 C77 88 74 90 70 90 L63 90 C67 74 67 50 61 34 Z" fill={CREAM_SHADE} />
          <Path d="M33 19 L67 19 L73 34 L27 34 Z" fill="#ead9b6" />
          <Path d="M40 20 L38 33 M50 19 L50 34 M60 20 L62 33" stroke={CREAM_SHADE} strokeWidth={1.4} />
          <Rect x={28} y={31} width={44} height={5} rx={2.5} fill={deep} />
          <Path d="M31 46 L69 46" stroke={CREAM_SHADE} strokeWidth={1.2} strokeDasharray="2.5 2" />
          <Rect x={31} y={49} width={38} height={27} rx={5} fill={color} />
          <Path d="M50 52 C44 54 43 60 47 63 C52 61 54 56 50 52 Z" fill={WHITE} />
          <Rect x={37} y={66} width={26} height={3.2} rx={1.6} fill={WHITE} opacity={0.92} />
          <Rect x={41} y={71} width={18} height={2.4} rx={1.2} fill={WHITE} opacity={0.6} />
        </G>
      ) : kind === 'bottle' ? (
        <G>
          <Rect x={43} y={9} width={14} height={9} rx={2.5} fill={deep} />
          <Path
            d="M45 18 L55 18 L55 28 C63 31 67 37 67 45 L67 84 C67 88 64 90 60 90 L40 90 C36 90 33 88 33 84 L33 45 C33 37 37 31 45 28 Z"
            fill="#eef5f0"
          />
          <Path d="M34 47 L66 47 L66 84 C66 87.5 63.5 89 60 89 L40 89 C36.5 89 34 87.5 34 84 Z" fill={liquid} />
          <Rect x={33} y={56} width={34} height={21} fill={WHITE} opacity={0.95} />
          <Rect x={33} y={56} width={34} height={5} fill={deep} />
          <Rect x={39} y={65} width={22} height={3} rx={1.5} fill={deep} opacity={0.8} />
          <Rect x={42} y={70} width={16} height={2.2} rx={1.1} fill={deep} opacity={0.45} />
          <Rect x={38} y={33} width={4} height={50} rx={2} fill={WHITE} opacity={0.45} />
        </G>
      ) : kind === 'jerrycan' ? (
        <G>
          <Path d="M35 31 V21 Q35 17 39 17 H51 Q55 17 55 21 V31" stroke={shade(liquid, 0.1)} strokeWidth={6} fill="none" />
          <Rect x={62} y={21} width={10} height={10} rx={2.5} fill={deep} />
          <Path d="M28 30 L64 30 L74 40 L74 85 C74 88 72 90 69 90 L31 90 C28 90 26 88 26 85 L26 32 C26 31 27 30 28 30 Z" fill={liquid} />
          <Path d="M62 30 L64 30 L74 40 L74 85 C74 88 72 90 69 90 L64 90 C67 76 67 46 62 30 Z" fill={shade(liquid, 0.14)} />
          <Rect x={31} y={50} width={36} height={25} rx={4} fill={WHITE} />
          <Rect x={31} y={50} width={36} height={6} rx={3} fill={deep} />
          <Path d="M49 59 C44 60.5 43.5 66 47 68 C51 66.5 52.5 62 49 59 Z" fill={color} />
          <Rect x={39} y={70} width={20} height={2.4} rx={1.2} fill={deep} opacity={0.5} />
          <Rect x={30} y={36} width={3.5} height={46} rx={1.75} fill={WHITE} opacity={0.35} />
        </G>
      ) : kind === 'pack' ? (
        <G>
          {[24, 42, 60].map((x) => (
            <G key={x}>
              <Rect x={x + 5} y={26} width={6} height={6} rx={1.5} fill={deep} />
              <Path
                d={`M${x + 4} 32 L${x + 12} 32 L${x + 12} 36 C${x + 15} 37 ${x + 16} 40 ${x + 16} 43 L${x + 16} 86 C${x + 16} 88 ${x + 15} 89 ${x + 13} 89 L${x + 3} 89 C${x + 1} 89 ${x} 88 ${x} 86 L${x} 43 C${x} 40 ${x + 1} 37 ${x + 4} 36 Z`}
                fill={tint(color, 0.55)}
              />
              <Rect x={x + 3} y={44} width={2.4} height={40} rx={1.2} fill={WHITE} opacity={0.55} />
            </G>
          ))}
          <Rect x={21} y={46} width={58} height={40} rx={7} fill={WHITE} opacity={0.32} />
          <Rect x={21} y={60} width={58} height={13} fill={color} />
          <Rect x={35} y={64.5} width={30} height={3.6} rx={1.8} fill={WHITE} opacity={0.9} />
        </G>
      ) : kind === 'can' ? (
        <G>
          <Rect x={28} y={30} width={44} height={56} fill={color} />
          <Ellipse cx={50} cy={86} rx={22} ry={5.5} fill={deep} />
          <Rect x={28} y={42} width={44} height={31} fill={WHITE} opacity={0.94} />
          <Circle cx={50} cy={57.5} r={9} fill="#d9412b" />
          <Path d="M50 48.5 C47 46 44 47 43 49 C46 49.5 48 49.5 50 48.5 Z M50 48.5 C53 46 56 47 57 49 C54 49.5 52 49.5 50 48.5 Z" fill="#3f8a3a" />
          <Circle cx={47} cy={55} r={2.2} fill={WHITE} opacity={0.5} />
          <Rect x={64} y={30} width={5} height={56} fill={WHITE} opacity={0.22} />
          <Ellipse cx={50} cy={30} rx={22} ry={5.5} fill="#d8dde0" />
          <Ellipse cx={50} cy={30} rx={18} ry={4} fill="#c2c9ce" />
        </G>
      ) : kind === 'bar' ? (
        <G>
          <Rect x={18} y={46} width={64} height={34} rx={11} fill={shade(light, 0.12)} />
          <Rect x={20} y={41} width={60} height={33} rx={10} fill={light} />
          <Ellipse cx={50} cy={57.5} rx={19} ry={8.5} stroke={WHITE} strokeWidth={2} fill="none" opacity={0.85} />
          <Rect x={40} y={55.5} width={20} height={4} rx={2} fill={color} opacity={0.75} />
          <Circle cx={27} cy={30} r={5} fill={WHITE} opacity={0.75} stroke={light} strokeWidth={1.4} />
          <Circle cx={37} cy={22} r={3} fill={WHITE} opacity={0.75} stroke={light} strokeWidth={1.2} />
          <Circle cx={72} cy={28} r={4} fill={WHITE} opacity={0.75} stroke={light} strokeWidth={1.3} />
        </G>
      ) : kind === 'sachet' ? (
        <G>
          <Path d="M30 24 L70 24 L73 85 C73 88 71 90 68 90 L32 90 C29 90 27 88 27 85 Z" fill={color} />
          <Path d="M62 24 L70 24 L73 85 C73 88 71 90 68 90 L65 90 C67 70 66 44 62 24 Z" fill={deep} opacity={0.5} />
          <Path d="M30 18 L33 24 L36 18 L39 24 L42 18 L45 24 L48 18 L51 24 L54 18 L57 24 L60 18 L63 24 L66 18 L69 24 L70 18 L70 26 L30 26 Z" fill={deep} />
          <Rect x={37} y={44} width={26} height={24} rx={12} fill={CREAM} />
          <Circle cx={45} cy={53} r={1.6} fill={CREAM_SHADE} />
          <Circle cx={52} cy={58} r={1.6} fill={CREAM_SHADE} />
          <Circle cx={56} cy={51} r={1.6} fill={CREAM_SHADE} />
          <Rect x={37} y={74} width={26} height={3.2} rx={1.6} fill={WHITE} opacity={0.9} />
          <Rect x={41} y={79} width={18} height={2.4} rx={1.2} fill={WHITE} opacity={0.6} />
        </G>
      ) : kind === 'jar' ? (
        <G>
          <Rect x={29} y={23} width={42} height={11} rx={3.5} fill={deep} />
          <Rect x={29} y={23} width={42} height={3.5} rx={1.75} fill={WHITE} opacity={0.25} />
          <Path d="M32 34 L68 34 C72 34 74 37 74 41 L74 82 C74 87 71 90 66 90 L34 90 C29 90 26 87 26 82 L26 41 C26 37 28 34 32 34 Z" fill="#fbf1de" />
          <Rect x={26} y={52} width={48} height={23} fill={color} />
          <Path d="M50 56 C44.5 57.5 44 63 47.5 65.5 C52 64 53.5 59.5 50 56 Z" fill={WHITE} />
          <Rect x={40} y={68.5} width={20} height={2.6} rx={1.3} fill={WHITE} opacity={0.8} />
          <Rect x={31} y={38} width={4} height={44} rx={2} fill={WHITE} opacity={0.6} />
        </G>
      ) : kind === 'box' ? (
        <G>
          <Path d="M20 44 L54 53 L54 89 L20 80 Z" fill="#d9a86c" />
          <Path d="M54 53 L80 43 L80 79 L54 89 Z" fill="#bf8a4f" />
          <Path d="M20 44 L46 34 L80 43 L54 53 Z" fill="#e8c18c" />
          <Path d="M33 39 L41 36 L67 45.5 L59 48.5 Z" fill={color} opacity={0.85} />
          <Rect x={27} y={60} width={20} height={13} rx={2} fill={WHITE} opacity={0.9} transform="skewY(15)" />
          <Rect x={30} y={70} width={12} height={2.2} rx={1.1} fill={color} transform="skewY(15)" />
        </G>
      ) : (
        <G>
          <Rect x={31} y={19} width={38} height={70} rx={5} fill={color} />
          <Rect x={31} y={19} width={38} height={9} rx={4} fill={deep} />
          <Rect x={60} y={19} width={9} height={70} rx={4} fill={deep} opacity={0.35} />
          <Rect x={37} y={38} width={26} height={28} rx={5} fill={CREAM} />
          <Path d="M41 44 Q50 48 59 44 M41 50 Q50 54 59 50 M41 56 Q50 60 59 56" stroke={CREAM_SHADE} strokeWidth={2} fill="none" />
          <Rect x={37} y={72} width={26} height={3.2} rx={1.6} fill={WHITE} opacity={0.9} />
          <Rect x={41} y={78} width={18} height={2.4} rx={1.2} fill={WHITE} opacity={0.6} />
        </G>
      )}
    </Svg>
  );
});
