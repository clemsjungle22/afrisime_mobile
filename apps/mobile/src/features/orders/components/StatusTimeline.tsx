import type { OrderStatusEvent } from '@afrisime/shared';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { formatShortDateTime } from '@/lib/dates';
import { useTheme } from '@/theme';
import { orderStatusInfo } from '../status';

/** Historique des statuts, du plus récent au plus ancien. */
export function StatusTimeline({ history }: { history: OrderStatusEvent[] }) {
  const theme = useTheme();
  const events = [...history].reverse();
  return (
    <View accessibilityRole="list">
      {events.map((e, i) => {
        const latest = i === 0;
        return (
          <View key={`${e.status}-${e.at}-${i}`} style={{ flexDirection: 'row', gap: theme.spacing.md }} accessibilityRole="text">
            <View style={{ alignItems: 'center', width: 14 }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  marginTop: 4,
                  backgroundColor: latest ? theme.colors.primary : theme.colors.border,
                }}
              />
              {i < events.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: theme.colors.border }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: theme.spacing.md, gap: 2 }}>
              <Text variant={latest ? 'bodyStrong' : 'body'} color={latest ? 'text' : 'textMuted'}>
                {orderStatusInfo[e.status].label}
              </Text>
              {e.note ? (
                <Text variant="caption" color="textMuted">
                  {e.note}
                </Text>
              ) : null}
              <Text variant="caption" color="textMuted">
                {formatShortDateTime(Date.parse(e.at))}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
