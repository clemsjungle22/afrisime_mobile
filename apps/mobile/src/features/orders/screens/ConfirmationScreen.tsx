import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA } from '@afrisime/shared';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { Button, ErrorState, FadeIn, Pattern, Skeleton, Text } from '@/components/ui';
import { Confetti } from '@/components/ui/Confetti';
import { SuccessMark } from '@/components/ui/SuccessMark';
import { formatSlotDay, formatSlotHours } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { gradients, palette, useTheme } from '@/theme';
import { useOrder } from '../hooks';
import { paymentMethodLabels } from '../status';

const Params = z.object({ orderId: z.string().min(1) });

export function ConfirmationScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const parsed = Params.safeParse(useLocalSearchParams());
  const order = useOrder(parsed.success ? parsed.data.orderId : '');
  const ready = !!order.data;

  useEffect(() => {
    if (ready) haptics.success();
  }, [ready]);

  if (!parsed.success) return <ErrorState error={null} onRetry={() => router.replace('/commandes')} />;
  if (!order.data) {
    return order.isError ? (
      <ErrorState error={order.error} onRetry={() => void order.refetch()} />
    ) : (
      <View style={{ padding: theme.spacing.xl, gap: theme.spacing.md, paddingTop: insets.top + 40 }}>
        <Skeleton height={220} radius={theme.radius.xl} />
        <Skeleton height={100} radius={theme.radius.lg} />
      </View>
    );
  }

  const o = order.data;
  const paidOnline = o.payment.status === 'succeeded';
  const slot = `${formatSlotDay(o.slot.start)} · ${formatSlotHours(o.slot.start, o.slot.end)}`;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.xl }}>
        <View style={[styles.hero, { paddingTop: insets.top + theme.spacing.xl }]}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Pattern color={palette.white} opacity={0.07} size={40} />
          <SuccessMark />
          <FadeIn index={2} style={{ alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.xl }}>
            <Text variant="hero" align="center" style={{ color: palette.white }} accessibilityRole="header">
              Merci !
            </Text>
            <Text align="center" style={{ color: palette.brand200 }} accessibilityLiveRegion="polite">
              {paidOnline
                ? `Paiement ${paymentMethodLabels[o.payment.method]} reçu. Votre commande est confirmée.`
                : `Votre commande est confirmée. ${paymentMethodLabels[o.payment.method]}.`}
            </Text>
          </FadeIn>
        </View>

        <View style={{ marginTop: -40, paddingHorizontal: theme.spacing.lg, gap: theme.spacing.lg }}>
          <FadeIn index={3}>
            <View
              style={{
                gap: theme.spacing.md,
                padding: theme.spacing.xl,
                borderRadius: theme.radius.xl,
                backgroundColor: theme.colors.surface,
                boxShadow: theme.shadows.lg,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ gap: 2 }}>
                  <Text variant="overline" color="textMuted">
                    COMMANDE
                  </Text>
                  <Text variant="title" selectable>
                    {o.orderNumber}
                  </Text>
                </View>
                <Text variant="priceLg" color="primary">
                  {formatFCFA(o.total)}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: theme.colors.border }} />
              <Row icon={o.fulfillment === 'delivery' ? 'bicycle' : 'storefront'} text={o.fulfillmentSummary} />
              <Row icon="time" text={slot} />
              <Row icon="bag-handle" text={`${o.itemCount} article${o.itemCount > 1 ? 's' : ''}`} />
            </View>
          </FadeIn>

          {o.pickupCode ? (
            <FadeIn index={4}>
              <View
                style={{
                  alignItems: 'center',
                  gap: 6,
                  padding: theme.spacing.xl,
                  borderRadius: theme.radius.xl,
                  backgroundColor: theme.colors.accentSoft,
                  borderWidth: 2,
                  borderStyle: 'dashed',
                  borderColor: palette.accent500,
                }}
              >
                <Text variant="overline" color="onAccentSoft">
                  CODE DE RETRAIT
                </Text>
                <Text
                  variant="hero"
                  color="onAccentSoft"
                  selectable
                  style={{ letterSpacing: 8 }}
                  accessibilityLabel={`Code de retrait ${o.pickupCode.split('').join(' ')}`}
                >
                  {o.pickupCode}
                </Text>
                <Text variant="caption" color="onAccentSoft" align="center">
                  À présenter en agence · disponible à tout moment dans Commandes
                </Text>
              </View>
            </FadeIn>
          ) : null}

          <FadeIn index={5} style={{ gap: theme.spacing.sm }}>
            <Button
              label="Suivre ma commande"
              size="lg"
              fullWidth
              onPress={() => router.replace({ pathname: '/orders/[orderId]', params: { orderId: o.id } })}
            />
            <Button label="Continuer mes achats" variant="ghost" fullWidth onPress={() => router.dismissTo('/')} />
          </FadeIn>
        </View>
      </ScrollView>
      <Confetti />
    </View>
  );
}

function Row({ icon, text }: { icon: 'bicycle' | 'storefront' | 'time' | 'bag-handle'; text: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.primarySoft,
        }}
      >
        <Ionicons name={icon} size={18} color={theme.colors.onPrimarySoft} />
      </View>
      <Text style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingBottom: 64,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    overflow: 'hidden',
  },
});
