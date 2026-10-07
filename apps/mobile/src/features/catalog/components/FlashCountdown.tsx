import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { palette } from '@/theme';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Compte à rebours en cases dorées jusqu'à `endsAt` (ISO). Masqué une fois l'offre terminée. */
export function FlashCountdown({ endsAt }: { endsAt: string }) {
  const end = Date.parse(endsAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(end) || end <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [end]);

  const remaining = Math.max(0, Math.floor((end - now) / 1000));
  if (Number.isNaN(end) || remaining <= 0) return null;
  const parts = [Math.floor(remaining / 3600), Math.floor((remaining % 3600) / 60), remaining % 60];

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
      accessibilityLabel={`Se termine dans ${parts[0]} heures ${parts[1]} minutes`}
      accessibilityRole="timer"
    >
      {parts.map((p, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ minWidth: 30, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 8, backgroundColor: palette.accent500, alignItems: 'center' }}>
            <Text variant="label" style={{ color: palette.brand950, fontSize: 14, lineHeight: 18 }} maxFontSizeMultiplier={1.2}>
              {pad(p)}
            </Text>
          </View>
          {i < 2 ? (
            <Text variant="label" style={{ color: palette.accent500 }}>
              :
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
