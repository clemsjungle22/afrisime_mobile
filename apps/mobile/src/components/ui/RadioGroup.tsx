import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { minTouchSize, useTheme } from '@/theme';
import { Badge } from './Badge';
import { Text } from './Text';

export type RadioItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  disabled?: boolean;
  /** Contenu aligné à droite (prix, frais…). */
  trailing?: ReactNode;
};

type Props = {
  title?: string;
  items: RadioItem[];
  value: string | null;
  onChange: (id: string) => void;
  error?: string;
};

/** Liste de choix exclusifs sous forme de cartes (zones tactiles généreuses). */
export function RadioGroup({ title, items, value, onChange, error }: Props) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel={title}>
      {title ? <Text variant="label">{title}</Text> : null}
      {items.map((item) => {
        const selected = item.id === value;
        const disabled = item.disabled === true;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            accessibilityLabel={[item.title, item.subtitle, item.badge].filter(Boolean).join(', ')}
            disabled={disabled}
            onPress={() => onChange(item.id)}
            style={[
              styles.card,
              {
                gap: theme.spacing.md,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                borderWidth: selected ? 2 : 1,
                opacity: disabled ? 0.55 : 1,
                borderColor: selected ? theme.colors.primary : error ? theme.colors.error : theme.colors.border,
                backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
              },
            ]}
          >
            <View style={[styles.dot, { borderColor: selected ? theme.colors.primary : theme.colors.border }]}>
              {selected ? <View style={[styles.dotInner, { backgroundColor: theme.colors.primary }]} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                <Text variant="bodyStrong">{item.title}</Text>
                {item.badge ? <Badge label={item.badge} tone="info" /> : null}
              </View>
              {item.subtitle ? (
                <Text variant="caption" color="textMuted">
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
            {item.trailing}
          </Pressable>
        );
      })}
      {error ? (
        <Text variant="caption" color="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchSize + 8,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
