import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

type Props = {
  step: number;
  title: string;
  action?: ReactNode;
  children: ReactNode;
};

/** Bloc numéroté du checkout (« 1 Réception », « 2 Adresse »…). */
export function CheckoutSection({ step, title, action, children }: Props) {
  const theme = useTheme();
  return (
    <View
      style={{
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.primary,
          }}
          importantForAccessibility="no-hide-descendants"
        >
          <Text variant="micro" color="onPrimary">
            {step}
          </Text>
        </View>
        <Text variant="subtitle" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}
