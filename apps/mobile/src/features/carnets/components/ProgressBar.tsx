import { View } from 'react-native';
import { useTheme } from '@/theme';

/** Barre de progression d'un carnet (part versée du prix). */
export function ProgressBar({ value, total, late = false }: { value: number; total: number; late?: boolean }) {
  const theme = useTheme();
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
      style={{ height: 10, borderRadius: 5, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' }}
    >
      <View
        style={{
          width: `${ratio * 100}%`,
          height: '100%',
          borderRadius: 5,
          backgroundColor: late ? theme.colors.warning : theme.colors.primary,
        }}
      />
    </View>
  );
}
