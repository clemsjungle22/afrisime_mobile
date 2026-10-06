import type { Slot } from '@afrisime/shared';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Chip, Text } from '@/components/ui';
import { formatSlotDay, formatSlotHours, slotDayKey } from '@/lib/dates';
import { useTheme } from '@/theme';

type Props = {
  slots: Slot[];
  value: string | null;
  onChange: (slotId: string) => void;
};

/** Choix du créneau : jours en onglets, puis plages horaires. Les créneaux complets sont grisés. */
export function SlotPicker({ slots, value, onChange }: Props) {
  const theme = useTheme();
  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) map.set(slotDayKey(s.start), [...(map.get(slotDayKey(s.start)) ?? []), s]);
    return [...map.entries()];
  }, [slots]);

  const selectedDay = slots.find((s) => s.id === value);
  const [day, setDay] = useState<string | null>(null);
  const activeDay = day ?? (selectedDay ? slotDayKey(selectedDay.start) : (days[0]?.[0] ?? null));
  const daySlots = days.find(([k]) => k === activeDay)?.[1] ?? [];

  if (slots.length === 0) {
    return <Text color="textMuted">Aucun créneau disponible pour le moment. Réessayez plus tard.</Text>;
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
        {days.map(([key, list]) => (
          <Chip
            key={key}
            label={formatSlotDay(list[0]!.start)}
            selected={key === activeDay}
            onPress={() => setDay(key)}
          />
        ))}
      </ScrollView>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {daySlots.map((s) => (
          <Chip
            key={s.id}
            role="checkbox"
            label={s.available ? formatSlotHours(s.start, s.end) : `${formatSlotHours(s.start, s.end)} · complet`}
            selected={s.id === value}
            disabled={!s.available}
            onPress={() => onChange(s.id)}
          />
        ))}
      </View>
    </View>
  );
}
