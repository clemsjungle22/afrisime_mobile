import Ionicons from '@expo/vector-icons/Ionicons';
import type { Fulfillment, OrderStatus } from '@afrisime/shared';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

type Step = { label: string; icon: ComponentProps<typeof Ionicons>['name'] };

const STEPS: Record<Fulfillment, Step[]> = {
  delivery: [
    { label: 'Confirmée', icon: 'checkmark' },
    { label: 'Préparation', icon: 'basket' },
    { label: 'En route', icon: 'bicycle' },
    { label: 'Livrée', icon: 'home' },
  ],
  pickup: [
    { label: 'Confirmée', icon: 'checkmark' },
    { label: 'Préparation', icon: 'basket' },
    { label: 'Prête', icon: 'storefront' },
    { label: 'Retirée', icon: 'bag-check' },
  ],
};

const STEP_INDEX: Partial<Record<OrderStatus, number>> = {
  confirmed: 0,
  preparing: 1,
  out_for_delivery: 2,
  ready_for_pickup: 2,
  delivered: 3,
  completed: 3,
};

/** Frise de progression (affichée pour les commandes confirmées). */
export function OrderProgress({ status, fulfillment }: { status: OrderStatus; fulfillment: Fulfillment }) {
  const theme = useTheme();
  const current = STEP_INDEX[status];
  if (current === undefined) return null;
  const steps = STEPS[fulfillment];

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Étape ${current + 1} sur ${steps.length} : ${steps[current]!.label}`}
      style={{
        flexDirection: 'row',
        padding: theme.spacing.lg,
        borderRadius: theme.radius.xl,
        backgroundColor: theme.colors.surface,
        boxShadow: theme.shadows.sm,
      }}
    >
      {steps.map((s, i) => {
        const done = i <= current;
        const active = i === current;
        return (
          <View key={s.label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i === 0 ? 'transparent' : i <= current ? theme.colors.primary : theme.colors.border }} />
              <View
                style={{
                  width: active ? 40 : 32,
                  height: active ? 40 : 32,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done ? (active ? theme.colors.accent : theme.colors.primary) : theme.colors.surfaceAlt,
                  boxShadow: active ? theme.shadows.md : undefined,
                }}
              >
                <Ionicons
                  name={s.icon}
                  size={active ? 20 : 16}
                  color={done ? (active ? theme.colors.onAccent : theme.colors.onPrimary) : theme.colors.textMuted}
                />
              </View>
              <View
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: i === steps.length - 1 ? 'transparent' : i < current ? theme.colors.primary : theme.colors.border,
                }}
              />
            </View>
            <Text variant="micro" color={done ? 'text' : 'textMuted'} align="center" numberOfLines={1}>
              {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
