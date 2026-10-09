import Ionicons from '@expo/vector-icons/Ionicons';
import {
  type CreditAccount,
  CREDIT_MIN_REPAYMENT,
  CREDIT_MIN_REQUEST,
  REPAYMENT_METHOD_LABELS,
  formatFCFA,
  formatNationalInput,
  repaymentError,
  toE164,
} from '@afrisime/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { isApiError } from '@/api/errors';
import { Badge, BottomSheet, Button, Chip, ErrorState, PaymentLogo, PressableScale, RadioGroup, Skeleton, Text, TextField } from '@/components/ui';
import { PulseIcon } from '@/components/ui/PulseIcon';
import { useOnboardingOptions } from '@/features/auth/hooks';
import { useSession } from '@/features/auth/session';
import { ProgressBar } from '@/features/carnets/components/ProgressBar';
import { haptics } from '@/lib/haptics';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { useCreditAccount, useRepay, useRequestCredit } from '../hooks';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Africa/Lome' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lome' });
const DEBT_LABELS = { open: 'En cours', settled: 'Remboursé', cancelled: 'Annulé' } as const;

/** Mon crédit : plafond, disponible, ce qui est dû aujourd'hui, achats à crédit et remboursements. */
export function CreditScreen() {
  const theme = useTheme();
  const account = useCreditAccount();
  useRefetchOnFocus(account.refetch);
  const [repaying, setRepaying] = useState(false);

  if (account.isPending) {
    return (
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <Skeleton height={170} radius={theme.radius.xl} />
        <Skeleton height={60} />
      </View>
    );
  }
  if (account.isError) return <ErrorState error={account.error} onRetry={() => void account.refetch()} />;
  const a = account.data;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
        refreshControl={<RefreshControl refreshing={account.isRefetching} onRefresh={() => void account.refetch()} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
      >
        {a.status === 'none' ? <NoCredit account={a} /> : <Summary account={a} onRepay={() => setRepaying(true)} />}
        {a.status !== 'none' ? <History account={a} /> : null}
      </ScrollView>
      {a.status !== 'none' ? <RepaySheet account={a} visible={repaying} onClose={() => setRepaying(false)} /> : null}
    </View>
  );
}

function Summary({ account: a, onRepay }: { account: CreditAccount; onRepay: () => void }) {
  const theme = useTheme();
  const late = a.daysLate > 0;
  const lastFailed = a.repayments[0] && (a.repayments[0].status === 'failed' || a.repayments[0].status === 'expired') ? a.repayments[0] : null;
  return (
    <>
      <View style={{ gap: theme.spacing.md, padding: theme.spacing.lg, borderRadius: theme.radius.xl, backgroundColor: theme.colors.surface, boxShadow: theme.shadows.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Badge
            label={a.status === 'suspended' ? 'Suspendu' : late ? `${a.daysLate} jour${a.daysLate > 1 ? 's' : ''} de retard` : 'À jour'}
            tone={a.status === 'suspended' ? 'error' : late ? 'warning' : 'success'}
          />
          <Text variant="caption" color="textMuted">
            Remboursement sur {a.termDays} jours
          </Text>
        </View>
        <View style={{ gap: 2 }}>
          <Text color="textMuted">Disponible pour vos achats</Text>
          <Text variant="display" color="primary">
            {formatFCFA(a.available)}
          </Text>
        </View>
        <ProgressBar value={a.used} total={a.limit} late={late} />
        <Text color="textMuted">
          {formatFCFA(a.used)} à rembourser · plafond {formatFCFA(a.limit)}
        </Text>
        {a.dueToday > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Ionicons name="calendar-outline" size={18} color={late ? theme.colors.warning : theme.colors.text} />
            <Text variant="bodyStrong" color={late ? 'warning' : 'text'}>
              À verser aujourd’hui : {formatFCFA(a.dueToday)}
            </Text>
          </View>
        ) : a.used > 0 ? (
          <Text color="success">Vous êtes à jour de vos remboursements.</Text>
        ) : null}
        {a.blockedReason ? <Text color={a.status === 'suspended' || late ? 'error' : 'textMuted'}>{a.blockedReason}</Text> : null}
      </View>

      {a.pendingRepayment ? (
        <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, boxShadow: theme.shadows.sm }}>
          <PulseIcon icon="phone-portrait" />
          <Text variant="subtitle" align="center">
            Confirmez sur votre téléphone
          </Text>
          <Text align="center" color="textMuted">
            {a.pendingRepayment.action?.instructions ?? 'Validez la demande de paiement reçue sur votre téléphone.'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text variant="bodyStrong">Remboursement de {formatFCFA(a.pendingRepayment.amount)} en attente</Text>
          </View>
        </View>
      ) : lastFailed ? (
        <Text color="error">
          Dernier remboursement non abouti : {lastFailed.failureReason ?? 'paiement non effectué'}. Aucun montant n’a été débité.
        </Text>
      ) : null}

      {a.used > 0 && !a.pendingRepayment ? (
        <Button label="Rembourser" size="lg" fullWidth onPress={onRepay} icon={<Ionicons name="cash-outline" size={22} color={theme.colors.onPrimary} />} />
      ) : null}
      {a.used > 0 ? <AgencyNote /> : null}
      {a.canBuy ? (
        <Button
          label="Faire mes courses à crédit"
          variant={a.used > 0 ? 'secondary' : 'primary'}
          fullWidth
          onPress={() => router.navigate('/boutique')}
        />
      ) : null}
      {a.canBuy ? (
        <Text variant="caption" color="textMuted">
          Au moment de commander, choisissez « Payer à crédit ». Chaque achat se rembourse en {a.termDays} jours, à partir du lendemain, sans frais.
        </Text>
      ) : null}
    </>
  );
}

function History({ account: a }: { account: CreditAccount }) {
  const theme = useTheme();
  return (
    <>
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="subtitle">Mes achats à crédit</Text>
        {a.debts.length === 0 ? (
          <Text color="textMuted">Aucun achat à crédit pour l’instant.</Text>
        ) : (
          a.debts.map((d) => (
            <PressableScale
              key={d.id}
              accessibilityRole="button"
              accessibilityLabel={`Commande ${d.orderNumber}, ${formatFCFA(d.paid)} remboursés sur ${formatFCFA(d.amount)}`}
              onPress={() => router.push({ pathname: '/orders/[orderId]', params: { orderId: d.orderId } })}
              style={{ gap: theme.spacing.xs, padding: theme.spacing.md, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, boxShadow: theme.shadows.sm }}
            >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Text variant="bodyStrong">Commande {d.orderNumber}</Text>
                  <Badge
                    label={d.status === 'open' && d.daysLate > 0 ? `${d.daysLate} j de retard` : DEBT_LABELS[d.status]}
                    tone={d.status === 'open' ? (d.daysLate > 0 ? 'warning' : 'info') : 'neutral'}
                  />
                </View>
                {d.status !== 'cancelled' ? <ProgressBar value={d.paid} total={d.amount} late={d.daysLate > 0} /> : null}
                <Text variant="caption" color="textMuted">
                  {formatFCFA(d.paid)} remboursés sur {formatFCFA(d.amount)}
                  {d.status === 'open' ? ` · ${formatFCFA(d.dailyAmount)} / jour · échéance le ${dateFmt.format(new Date(d.dueAt))}` : ''}
                </Text>
            </PressableScale>
          ))
        )}
      </View>
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="subtitle">Remboursements</Text>
        {a.repayments.length === 0 ? (
          <Text color="textMuted">Aucun remboursement pour l’instant.</Text>
        ) : (
          a.repayments.map((x) => (
            <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <Ionicons
                name={x.status === 'succeeded' ? 'checkmark-circle' : x.status === 'pending' ? 'time-outline' : 'close-circle'}
                size={20}
                color={x.status === 'succeeded' ? theme.colors.primary : x.status === 'pending' ? theme.colors.info : theme.colors.error}
              />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{formatFCFA(x.amount)}</Text>
                <Text variant="caption" color="textMuted">
                  {x.method === 'cash' ? `Payé en agence${x.agencyName ? ` · ${x.agencyName}` : ''}` : REPAYMENT_METHOD_LABELS[x.method]} ·{' '}
                  {dateTimeFmt.format(new Date(x.createdAt))}
                </Text>
              </View>
              {x.status !== 'succeeded' ? (
                <Text variant="caption" color={x.status === 'pending' ? 'info' : 'error'}>
                  {x.status === 'pending' ? 'En attente' : x.status === 'expired' ? 'Expiré' : 'Refusé'}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    </>
  );
}

/** Pas encore de crédit : demande (comptes pros), demande en cours ou refusée. */
function NoCredit({ account: a }: { account: CreditAccount }) {
  const theme = useTheme();
  const requestCredit = useRequestCredit();
  const [amount, setAmount] = useState('50000');
  const [message, setMessage] = useState('');
  const value = Number(amount.replace(/\D/g, '')) || 0;
  const amountError = value < CREDIT_MIN_REQUEST ? `Montant minimum : ${formatFCFA(CREDIT_MIN_REQUEST)}.` : null;
  const pending = a.request?.status === 'pending';

  const submit = () =>
    requestCredit.mutate(
      { amount: value, message: message.trim() || undefined },
      {
        onSuccess: (next) => {
          haptics.success();
          showSnackbar({ message: next.status === 'active' ? 'Crédit accordé !' : 'Demande envoyée : votre agence vous répond rapidement.' });
        },
        onError: (e) => showSnackbar({ message: isApiError(e) && !e.isNetwork ? e.message : 'Impossible pour le moment. Réessayez.' }),
      },
    );

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.sm, padding: theme.spacing.lg, borderRadius: theme.radius.xl, backgroundColor: theme.colors.primarySoft }}>
        <Ionicons name="storefront-outline" size={28} color={theme.colors.primary} />
        <Text variant="subtitle" color="onPrimarySoft">
          Achetez aujourd’hui, remboursez un peu chaque jour
        </Text>
        <Text color="onPrimarySoft">
          Pour les revendeuses et les professionnels : recevez vos produits tout de suite et remboursez chaque jour par Mobile
          Money ou en agence, sans frais.
        </Text>
      </View>

      {pending ? (
        <View style={{ gap: theme.spacing.xs, padding: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, boxShadow: theme.shadows.sm }}>
          <Badge label="Demande en cours d’examen" tone="info" />
          <Text>
            Vous avez demandé {formatFCFA(a.request!.amount)} le {dateFmt.format(new Date(a.request!.createdAt))}. Votre agence vous
            répond rapidement ; votre crédit apparaîtra ici.
          </Text>
        </View>
      ) : null}
      {a.request?.status === 'rejected' ? (
        <Text color="error">
          Votre dernière demande n’a pas été acceptée{a.request.reason ? ` : ${a.request.reason}` : '.'}
        </Text>
      ) : null}

      {a.canRequest ? (
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="subtitle">Demander un crédit</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {[25_000, 50_000, 100_000].map((n) => (
              <Chip key={n} label={formatFCFA(n)} selected={value === n} onPress={() => setAmount(String(n))} />
            ))}
          </View>
          <TextField
            label="Montant souhaité (F CFA)"
            keyboardType="number-pad"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/\D/g, ''))}
            error={amount !== '' && amountError ? amountError : undefined}
            hint="Plafond de vos achats à crédit non remboursés. L’équipe fixe le montant et la durée."
          />
          <TextField
            label="Votre activité (facultatif)"
            value={message}
            onChangeText={setMessage}
            maxLength={400}
            placeholder="Ex. : je revends au marché de Hédzranawoé"
          />
          <Button label="Envoyer ma demande" size="lg" fullWidth disabled={amountError !== null} loading={requestCredit.isPending} onPress={submit} />
        </View>
      ) : !pending ? (
        <View style={{ gap: theme.spacing.md }}>
          <Text color="textMuted">
            Le crédit est réservé aux revendeuses et aux professionnels dont le profil a été validé par AfriSime. Déclarez votre
            activité dans votre profil : une fois validé, vous pourrez faire votre demande ici.
          </Text>
          <Button label="Mon compte" variant="secondary" onPress={() => router.navigate('/compte')} />
        </View>
      ) : null}
    </View>
  );
}

/** Rappel : on peut aussi rembourser en espèces dans une agence. */
function AgencyNote() {
  const theme = useTheme();
  const options = useOnboardingOptions();
  const names = options.data?.agencies.map((a) => a.name.replace(/^Lomé /, '')).join(', ');
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.primarySoft }}>
      <Ionicons name="storefront-outline" size={20} color={theme.colors.primary} />
      <Text style={{ flex: 1 }} color="onPrimarySoft">
        Vous pouvez aussi rembourser en espèces dans votre agence{names ? ` (${names})` : ''} : le montant apparaît ici dès qu’il
        est enregistré.
      </Text>
    </View>
  );
}

function RepaySheet({ account: a, visible, onClose }: { account: CreditAccount; visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const repay = useRepay();
  const accountPhone = useSession((s) => s.phone);
  const [method, setMethod] = useState<'mixx' | 'flooz'>('mixx');
  const [phoneInput, setPhoneInput] = useState(formatNationalInput(accountPhone ?? ''));
  // Montant choisi ; null : ce qui est dû aujourd'hui (ou le versement minimum).
  const [custom, setCustom] = useState<string | null>(null);

  const suggested = a.dueToday > 0 ? a.dueToday : Math.min(a.used, Math.max(CREDIT_MIN_REPAYMENT, a.debts.find((d) => d.status === 'open')?.dailyAmount ?? 0));
  const presets = [
    { label: a.dueToday > 0 ? `Dû aujourd’hui · ${formatFCFA(a.dueToday)}` : `Un versement · ${formatFCFA(suggested)}`, amount: suggested },
    ...(a.used > suggested ? [{ label: `Tout · ${formatFCFA(a.used)}`, amount: a.used }] : []),
  ];
  const amount = custom === null ? suggested : Number(custom.replace(/\D/g, '')) || 0;
  const phone = toE164(phoneInput);
  const amountError = repaymentError(amount, a.used);

  const close = () => {
    setCustom(null);
    onClose();
  };
  const submit = () => {
    if (!phone || amountError) return;
    repay.mutate(
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
      title="Rembourser"
      onClose={close}
      footer={<Button label={`Payer ${formatFCFA(amount)}`} size="lg" fullWidth disabled={!phone || amountError !== null} loading={repay.isPending} onPress={submit} />}
    >
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label">Montant</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {presets.map((p) => (
              <Chip
                key={p.label}
                label={p.label}
                selected={custom === null ? p.amount === suggested : amount === p.amount}
                onPress={() => setCustom(p.amount === suggested ? null : String(p.amount))}
              />
            ))}
          </View>
          <TextField
            label="Autre montant (F CFA)"
            keyboardType="number-pad"
            value={custom ?? ''}
            placeholder={String(suggested)}
            onChangeText={(t) => setCustom(t.replace(/\D/g, '') || null)}
            error={custom !== null && amountError ? amountError : undefined}
            hint={`Minimum ${formatFCFA(Math.min(CREDIT_MIN_REPAYMENT, a.used))}, maximum ${formatFCFA(a.used)}. Le plus ancien achat est réglé en premier.`}
          />
        </View>
        <RadioGroup
          title="Payer avec"
          items={(['mixx', 'flooz'] as const).map((id) => ({ id, title: REPAYMENT_METHOD_LABELS[id], subtitle: 'Confirmation sur votre téléphone', leading: <PaymentLogo method={id} /> }))}
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
