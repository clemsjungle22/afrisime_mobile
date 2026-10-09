import Ionicons from '@expo/vector-icons/Ionicons';
import {
  type Carnet,
  CARNET_STATUS_LABELS,
  CONTRIBUTION_METHOD_LABELS,
  MIN_CONTRIBUTION,
  contributionError,
  formatFCFA,
  formatNationalInput,
  toE164,
} from '@afrisime/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, View } from 'react-native';
import { isApiError } from '@/api/errors';
import { Badge, BottomSheet, Button, Chip, ErrorState, PaymentLogo, RadioGroup, Skeleton, Text, TextField } from '@/components/ui';
import { PulseIcon } from '@/components/ui/PulseIcon';
import { useOnboardingOptions } from '@/features/auth/hooks';
import { useSession } from '@/features/auth/session';
import { ProductThumb } from '@/features/catalog/components/ProductThumb';
import { formatSlotDay } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { ProgressBar } from '../components/ProgressBar';
import { useAbandon, useCarnet, useContribute, useSubscribe } from '../hooks';
import { STATUS_TONES } from './CarnetsScreen';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Africa/Lome' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lome' });

export function CarnetDetailScreen() {
  const theme = useTheme();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const carnet = useCarnet(id);
  useRefetchOnFocus(carnet.refetch);
  const [contributing, setContributing] = useState(false);

  if (carnet.isPending) {
    return (
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <Skeleton height={160} radius={theme.radius.lg} />
        <Skeleton height={60} />
      </View>
    );
  }
  if (carnet.isError) return <ErrorState error={carnet.error} onRetry={() => void carnet.refetch()} />;
  const c = carnet.data;
  const late = c.status === 'active' && c.daysLate > 0;
  const lastFailed = c.contributions[0] && (c.contributions[0].status === 'failed' || c.contributions[0].status === 'expired') ? c.contributions[0] : null;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: c.name }} />
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
        refreshControl={<RefreshControl refreshing={carnet.isRefetching} onRefresh={() => void carnet.refetch()} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
      >
        <View style={{ gap: theme.spacing.md, padding: theme.spacing.lg, borderRadius: theme.radius.xl, backgroundColor: theme.colors.surface, boxShadow: theme.shadows.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Badge label={late ? `${c.daysLate} jour${c.daysLate > 1 ? 's' : ''} de retard` : CARNET_STATUS_LABELS[c.status]} tone={late ? 'warning' : STATUS_TONES[c.status]} />
            <Text variant="caption" color="textMuted">
              {formatFCFA(c.dailyAmount)} / jour
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xs }}>
            <Text variant="display" color="primary">
              {formatFCFA(c.paid)}
            </Text>
            <Text color="textMuted">sur {formatFCFA(c.price)}</Text>
          </View>
          <ProgressBar value={c.paid} total={c.price} late={late} />
          {c.status === 'active' ? (
            <Text color="textMuted">
              Reste {formatFCFA(c.remaining)} · échéance le {dateFmt.format(new Date(c.dueAt))}
              {late ? ` · pour être à jour : ${formatFCFA(Math.min(c.remaining, c.expectedToDate - c.paid))}` : ''}
            </Text>
          ) : c.status === 'completed' ? (
            <Text color="success" variant="bodyStrong">
              Carnet soldé ! Choisissez comment recevoir votre pack.
            </Text>
          ) : c.status === 'delivered' ? (
            <Text color="textMuted">Votre pack a été commandé : suivez-le dans vos commandes.</Text>
          ) : c.status === 'abandoned' ? (
            <Text color="textMuted">
              {c.creditedAmount > 0
                ? `Carnet clos : ${formatFCFA(c.creditedAmount)} transformés en avoir, à utiliser lors d’une prochaine commande.`
                : 'Carnet clos.'}
            </Text>
          ) : null}
        </View>

        {c.pendingContribution ? (
          <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, boxShadow: theme.shadows.sm }}>
            <PulseIcon icon="phone-portrait" />
            <Text variant="subtitle" align="center">
              Confirmez sur votre téléphone
            </Text>
            <Text align="center" color="textMuted">
              {c.pendingContribution.action?.instructions ?? 'Validez la demande de paiement reçue sur votre téléphone.'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text variant="bodyStrong">Cotisation de {formatFCFA(c.pendingContribution.amount)} en attente</Text>
            </View>
          </View>
        ) : lastFailed ? (
          <Text color="error">
            Dernière cotisation non aboutie : {lastFailed.failureReason ?? 'paiement non effectué'}. Aucun montant n’a été débité.
          </Text>
        ) : null}

        {c.status === 'active' && !c.pendingContribution ? (
          <Button label="Cotiser" size="lg" fullWidth onPress={() => setContributing(true)} icon={<Ionicons name="add-circle-outline" size={22} color={theme.colors.onPrimary} />} />
        ) : null}
        {c.status === 'active' ? <AgencyNote /> : null}
        {c.status === 'completed' ? (
          <Button label="Recevoir mon pack" size="lg" fullWidth onPress={() => router.push({ pathname: '/recevoir-pack/[id]', params: { id: c.id } })} icon={<Ionicons name="gift-outline" size={22} color={theme.colors.onPrimary} />} />
        ) : null}
        {c.status === 'delivered' || c.status === 'abandoned' ? <ReopenButton packId={c.packId} /> : null}
        {c.status === 'delivered' && c.orderId ? (
          <Button label="Voir la commande" variant="secondary" fullWidth onPress={() => router.push({ pathname: '/orders/[orderId]', params: { orderId: c.orderId! } })} />
        ) : null}

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subtitle">Historique</Text>
          {c.contributions.length === 0 ? (
            <Text color="textMuted">Aucune cotisation pour l’instant.</Text>
          ) : (
            c.contributions.map((x) => (
              <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                <Ionicons
                  name={x.status === 'succeeded' ? 'checkmark-circle' : x.status === 'pending' ? 'time-outline' : 'close-circle'}
                  size={20}
                  color={x.status === 'succeeded' ? theme.colors.primary : x.status === 'pending' ? theme.colors.info : theme.colors.error}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{formatFCFA(x.amount)}</Text>
                  <Text variant="caption" color="textMuted">
                    {x.method === 'cash' ? `Payé en agence${x.agencyName ? ` · ${x.agencyName}` : ''}` : CONTRIBUTION_METHOD_LABELS[x.method]} · {dateTimeFmt.format(new Date(x.createdAt))}
                  </Text>
                </View>
                {x.status !== 'succeeded' ? (
                  <Text variant="caption" color={x.status === 'pending' ? 'info' : 'error'}>
                    {x.status === 'pending' ? 'En attente' : x.status === 'expired' ? 'Expirée' : 'Refusée'}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subtitle">Dans le pack</Text>
          {c.items.map((item) => (
            <View key={item.variantId} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <View style={{ width: 40, height: 40, borderRadius: theme.radius.sm, overflow: 'hidden' }}>
                <ProductThumb name={item.productName} imageUrl={item.imageUrl} color={item.color} />
              </View>
              <Text style={{ flex: 1 }} numberOfLines={1}>
                {item.productName} · {item.variantLabel}
              </Text>
              <Text variant="bodyStrong">× {item.quantity}</Text>
            </View>
          ))}
          <Text variant="caption" color="textMuted">
            Ouvert le {formatSlotDay(c.startedAt)} · contenu et prix garantis.
            {c.status === 'active' ? ` Sans paiement complet au ${dateFmt.format(new Date(c.deadlineAt))}, le carnet sera clos et vos versements transformés en avoir.` : ''}
          </Text>
        </View>
        {c.status === 'active' && !c.pendingContribution ? <AbandonButton carnet={c} /> : null}
      </ScrollView>
      <ContributeSheet carnet={c} visible={contributing} onClose={() => setContributing(false)} />
    </View>
  );
}

/** Rouvrir le même pack : nouveau carnet, au contenu et au prix du jour. */
function ReopenButton({ packId }: { packId: string }) {
  const subscribe = useSubscribe();
  return (
    <Button
      label="Ouvrir à nouveau ce pack"
      variant="secondary"
      fullWidth
      loading={subscribe.isPending}
      onPress={() =>
        subscribe.mutate(packId, {
          onSuccess: (carnet) => {
            haptics.success();
            router.replace({ pathname: '/carnets/[id]', params: { id: carnet.id } });
          },
          onError: (e) => showSnackbar({ message: isApiError(e) && !e.isNetwork ? e.message : 'Impossible pour le moment. Réessayez.' }),
        })
      }
    />
  );
}

/** Abandon (confirmé) : les sommes versées deviennent un avoir. */
function AbandonButton({ carnet: c }: { carnet: Carnet }) {
  const abandon = useAbandon(c.id);
  const confirm = () =>
    Alert.alert(
      'Abandonner ce carnet ?',
      c.paid > 0
        ? `Les ${formatFCFA(c.paid)} déjà versés deviendront un avoir, à utiliser lors d’une prochaine commande. Ils ne sont pas remboursés en argent.`
        : 'Rien n’a encore été versé sur ce carnet.',
      [
        { text: 'Garder mon carnet', style: 'cancel' },
        {
          text: 'Abandonner',
          style: 'destructive',
          onPress: () =>
            abandon.mutate(undefined, {
              onSuccess: () => {
                showSnackbar({ message: c.paid > 0 ? `Carnet abandonné : ${formatFCFA(c.paid)} d’avoir.` : 'Carnet abandonné.' });
                // Sans versement, il quitte « Mes carnets » : retour à la liste.
                if (c.paid === 0) router.back();
              },
              onError: (e) => showSnackbar({ message: isApiError(e) && !e.isNetwork ? e.message : 'Impossible pour le moment. Réessayez.' }),
            }),
        },
      ],
    );
  return <Button label="Abandonner ce carnet" variant="ghost" loading={abandon.isPending} onPress={confirm} />;
}

/** Rappel : on peut aussi cotiser en espèces dans une agence. */
function AgencyNote() {
  const theme = useTheme();
  const options = useOnboardingOptions();
  const names = options.data?.agencies.map((a) => a.name.replace(/^Lomé /, '')).join(', ');
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.primarySoft }}>
      <Ionicons name="storefront-outline" size={20} color={theme.colors.primary} />
      <Text style={{ flex: 1 }} color="onPrimarySoft">
        Vous pouvez aussi cotiser en espèces dans votre agence{names ? ` (${names})` : ''} : votre cotisation apparaît ici dès qu’elle est enregistrée.
      </Text>
    </View>
  );
}

function ContributeSheet({ carnet: c, visible, onClose }: { carnet: Carnet; visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const contribute = useContribute(c.id);
  const accountPhone = useSession((s) => s.phone);
  const [method, setMethod] = useState<'mixx' | 'flooz'>('mixx');
  const [phoneInput, setPhoneInput] = useState(formatNationalInput(accountPhone ?? ''));
  // Montant choisi ; null : la cotisation du jour.
  const [custom, setCustom] = useState<string | null>(null);

  const today = Math.min(c.remaining, c.dailyAmount);
  const catchUp = Math.min(c.remaining, c.expectedToDate - c.paid);
  const presets = [
    { label: `Du jour · ${formatFCFA(today)}`, amount: today },
    ...(catchUp > today ? [{ label: `À jour · ${formatFCFA(catchUp)}`, amount: catchUp }] : []),
    ...(c.remaining > Math.max(today, catchUp) ? [{ label: `Tout solder · ${formatFCFA(c.remaining)}`, amount: c.remaining }] : []),
  ];
  const amount = custom === null ? today : Number(custom.replace(/\D/g, '')) || 0;
  const phone = toE164(phoneInput);
  const amountError = contributionError(amount, c.remaining);

  const close = () => {
    setCustom(null);
    onClose();
  };
  const submit = () => {
    if (!phone || amountError) return;
    contribute.mutate(
      { amount, method, phone },
      {
        onSuccess: () => {
          haptics.tap();
          close();
        },
        onError: (e) =>
          showSnackbar({ message: isApiError(e) && !e.isNetwork ? e.message : 'Connexion instable. Réessayez : vous ne serez pas débité deux fois.' }),
      },
    );
  };

  return (
    <BottomSheet
      visible={visible}
      title="Cotiser"
      onClose={close}
      footer={<Button label={`Payer ${formatFCFA(amount)}`} size="lg" fullWidth disabled={!phone || amountError !== null} loading={contribute.isPending} onPress={submit} />}
    >
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label">Montant</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {presets.map((p) => (
              <Chip key={p.label} label={p.label} selected={custom === null ? p.amount === today : amount === p.amount} onPress={() => setCustom(p.amount === today ? null : String(p.amount))} />
            ))}
          </View>
          <TextField
            label="Autre montant (F CFA)"
            keyboardType="number-pad"
            value={custom ?? ''}
            placeholder={String(today)}
            onChangeText={(t) => setCustom(t.replace(/\D/g, '') || null)}
            error={custom !== null && amountError ? amountError : undefined}
            hint={`Minimum ${formatFCFA(Math.min(MIN_CONTRIBUTION, c.remaining))}, maximum ${formatFCFA(c.remaining)}.`}
          />
        </View>
        <RadioGroup
          title="Payer avec"
          items={(['mixx', 'flooz'] as const).map((id) => ({ id, title: CONTRIBUTION_METHOD_LABELS[id], subtitle: 'Confirmation sur votre téléphone', leading: <PaymentLogo method={id} /> }))}
          value={method}
          onChange={(id) => setMethod(id as 'mixx' | 'flooz')}
        />
        <TextField
          label="Numéro Mobile Money (+228)"
          value={phoneInput}
          onChangeText={(t) => setPhoneInput(formatNationalInput(t))}
          keyboardType="phone-pad"
          maxLength={11}
          error={phoneInput.replace(/\D/g, '').length === 8 && !phone ? 'Numéro mobile togolais invalide' : undefined}
        />
      </View>
    </BottomSheet>
  );
}
