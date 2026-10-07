import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

type Item = { icon: ComponentProps<typeof Ionicons>['name']; title: string; text: string };

/** Réassurance (repris de « Pourquoi AfriSime » du site). [À confirmer] délais et engagements. */
const ITEMS: Item[] = [
  { icon: 'bicycle', title: 'Livré à Lomé', text: 'Dès aujourd’hui selon le créneau' },
  { icon: 'phone-portrait', title: 'Mobile Money', text: 'T-Money, Flooz ou à la livraison' },
  { icon: 'leaf', title: 'Prix justes', text: 'Du détail au format pro' },
];

export function TrustStrip() {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg }}>
      {ITEMS.map((item) => (
        <View
          key={item.title}
          style={{
            flex: 1,
            gap: 6,
            padding: theme.spacing.md,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surface,
            boxShadow: theme.shadows.sm,
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accentSoft,
            }}
          >
            <Ionicons name={item.icon} size={18} color={theme.colors.onAccentSoft} />
          </View>
          <Text variant="label" style={{ fontSize: 13, lineHeight: 16 }}>
            {item.title}
          </Text>
          <Text variant="micro" color="textMuted">
            {item.text}
          </Text>
        </View>
      ))}
    </View>
  );
}
