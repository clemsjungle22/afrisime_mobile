import Ionicons from '@expo/vector-icons/Ionicons';
import { maskPhone } from '@afrisime/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { apiConfig } from '@/api/config';
import { MOCK_OTP_CODE, RATE_LIMITED_PHONE } from '@/api/mock/authServer';
import { SEED_USER } from '@/api/mock/db';
import { useMockScenarios } from '@/api/mock/scenarios';
import { Badge, Button, Screen, Skeleton, Text } from '@/components/ui';
import { useMe, useOnboardingOptions } from '@/features/auth/hooks';
import { signOut, useSession } from '@/features/auth/session';
import { useCart } from '@/features/cart/store';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';

export function AccountScreen() {
  const theme = useTheme();
  const status = useSession((s) => s.status);
  return (
    <Screen scroll>
      <Text variant="display" accessibilityRole="header">
        Compte
      </Text>
      <View style={{ marginTop: theme.spacing.lg }}>{status === 'authenticated' ? <SignedIn /> : <Guest />}</View>
      {apiConfig.mock ? <DemoTools /> : null}
    </Screen>
  );
}

function Guest() {
  const theme = useTheme();
  return (
    <View
      style={{
        gap: theme.spacing.md,
        padding: theme.spacing.xl,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.primarySoft,
      }}
    >
      <Ionicons name="person-circle-outline" size={48} color={theme.colors.onPrimarySoft} />
      <Text variant="subtitle">Connectez-vous pour commander</Text>
      <Text color="textMuted">
        Suivez vos commandes, retrouvez votre panier sur tous vos appareils et accédez aux prix de votre profil.
      </Text>
      <Button label="Se connecter ou créer un compte" size="lg" fullWidth onPress={() => router.push('/login')} />
    </View>
  );
}

function Row({ label, value, badge }: { label: string; value: string; badge?: string | null }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Text color="textMuted">{label}</Text>
      <View style={{ flexShrink: 1, alignItems: 'flex-end', gap: 4 }}>
        <Text variant="bodyStrong" align="right">
          {value}
        </Text>
        {badge ? <Badge label={badge} tone="info" /> : null}
      </View>
    </View>
  );
}

function SignedIn() {
  const theme = useTheme();
  const phone = useSession((s) => s.phone);
  const me = useMe();
  const options = useOnboardingOptions();
  const [leaving, setLeaving] = useState(false);

  const user = me.data;
  const type = options.data?.customerTypes.find((t) => t.id === user?.customerTypeId);
  const agency = options.data?.agencies.find((a) => a.id === user?.agencyId);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  const confirmSignOut = () =>
    Alert.alert('Se déconnecter ?', 'Votre panier sera retiré de ce téléphone. Il reste enregistré sur votre compte.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          void signOut().finally(() => {
            setLeaving(false);
            showSnackbar({ message: 'Vous êtes déconnecté.' });
          });
        },
      },
    ]);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.primary,
          }}
        >
          <Text variant="title" color="onPrimary">
            {(user?.firstName?.[0] ?? '?').toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          {me.isPending ? (
            <Skeleton width="60%" height={20} />
          ) : (
            <Text variant="subtitle">{name || 'Profil à compléter'}</Text>
          )}
          {phone ? (
            <Text color="textMuted" accessibilityLabel="Numéro masqué">
              {maskPhone(phone)}
            </Text>
          ) : null}
        </View>
      </View>

      {user && !user.profileComplete ? (
        <View style={{ gap: theme.spacing.sm, padding: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.colors.warningSoft }}>
          <Text variant="bodyStrong" color="warning">
            Complétez votre profil pour pouvoir commander.
          </Text>
          <Button label="Compléter mon profil" onPress={() => router.push('/profile-setup')} />
        </View>
      ) : null}

      {user ? (
        <View>
          <Row label="Profil" value={type?.label ?? '—'} badge={user.customerTypePending ? 'En cours de validation' : null} />
          <Row label="Tarifs appliqués" value={user.segmentLabel} />
          <Row label="Agence" value={agency?.name ?? '—'} />
          <Row label="Offres et promotions" value={user.consents.marketing ? 'Acceptées' : 'Refusées'} />
        </View>
      ) : me.isError ? (
        <Text color="textMuted">Profil indisponible hors connexion.</Text>
      ) : null}

      <Button label="Se déconnecter" variant="ghost" loading={leaving} onPress={confirmSignOut} />
    </View>
  );
}

/** Outils du mode démo (données simulées) : absents quand l'app parle au vrai backend. */
function DemoTools() {
  const theme = useTheme();
  const armed = useMockScenarios((s) => s.cartChangeArmed);
  const overrides = useMockScenarios((s) => s.overrides);
  const arm = useMockScenarios((s) => s.armCartChange);
  const reset = useMockScenarios((s) => s.reset);
  const clearCart = useCart((s) => s.clear);
  const active = overrides.prices.size + overrides.stock.size + overrides.unavailable.size > 0;

  return (
    <View
      style={{
        marginTop: theme.spacing.xxl,
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Text variant="subtitle">Mode démo</Text>
        <Badge label="Données simulées" tone="warning" />
      </View>

      <Text variant="bodyStrong">Connexion</Text>
      <Text variant="caption" color="textMuted">
        Code SMS de test : {MOCK_OTP_CODE}. Compte existant : {SEED_USER.phone.slice(4)} ({SEED_USER.firstName}). Tout
        autre numéro crée un compte. {RATE_LIMITED_PHONE.slice(4)} simule « trop de demandes ».
      </Text>

      <Text variant="bodyStrong">Panier modifié par le serveur</Text>
      <Text variant="caption" color="textMuted">
        Au prochain contrôle du panier : +10 % sur le 1er article, stock réduit sur le 2e, rupture sur le 3e.
        Ajoutez au moins 3 articles pour voir les trois cas.
      </Text>
      <Button
        label={armed ? 'Scénario armé — ouvrez le panier' : 'Simuler un panier modifié'}
        variant="secondary"
        disabled={armed}
        onPress={() => {
          arm();
          showSnackbar({ message: 'Ouvrez le panier pour voir les changements.' });
        }}
      />
      {active || armed ? <Button label="Revenir aux prix et stocks normaux" variant="ghost" onPress={reset} /> : null}

      <Button
        label="Vider le panier"
        variant="ghost"
        onPress={() => {
          clearCart();
          showSnackbar({ message: 'Panier vidé.' });
        }}
      />
    </View>
  );
}
