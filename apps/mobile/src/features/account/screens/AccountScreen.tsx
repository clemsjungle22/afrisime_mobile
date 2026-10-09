import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA, maskPhone } from '@afrisime/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { apiConfig } from '@/api/config';
import { MOCK_OTP_CODE, RATE_LIMITED_PHONE } from '@/api/mock/authServer';
import { SEED_USER } from '@/api/mock/db';
import { useMockScenarios } from '@/api/mock/scenarios';
import { SceneIllustration } from '@/components/illustrations/SceneIllustration';
import { Badge, Button, Pattern, PressableScale, Screen, Skeleton, Text } from '@/components/ui';
import { useMe, useOnboardingOptions } from '@/features/auth/hooks';
import { signOut, useSession } from '@/features/auth/session';
import { useCart } from '@/features/cart/store';
import { useCarnets, useStoreCredit } from '@/features/carnets/hooks';
import { useFavorites, useLists } from '@/features/lists/hooks';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { showSnackbar } from '@/stores/snackbar';
import { FLOATING_TAB_BAR_SPACE } from '@/components/navigation/FloatingTabBar';
import { gradients, palette, useTheme } from '@/theme';

export function AccountScreen() {
  const theme = useTheme();
  const status = useSession((s) => s.status);
  const me = useMe();
  return (
    <Screen
      scroll
      contentStyle={{ paddingBottom: FLOATING_TAB_BAR_SPACE }}
      refreshControl={
        status === 'authenticated' ? (
          <RefreshControl
            refreshing={me.isRefetching}
            onRefresh={() => void me.refetch()}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        ) : undefined
      }
    >
      <Text variant="display" accessibilityRole="header">
        Compte
      </Text>
      <View style={{ marginTop: theme.spacing.lg }}>{status === 'authenticated' ? <SignedIn /> : <Guest />}</View>
      {apiConfig.mock ? <DemoTools /> : null}
      {__DEV__ ? <DevServerInfo /> : null}
    </Screen>
  );
}

/** Développement : à quoi l'app est branchée (utile quand le PC change de réseau). */
function DevServerInfo() {
  const theme = useTheme();
  return (
    <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing.lg, textAlign: 'center' }} selectable>
      {apiConfig.mock ? 'Mode démo (aucun serveur)' : `Serveur : ${apiConfig.baseUrl || 'non configuré'}`}
    </Text>
  );
}

function Guest() {
  const theme = useTheme();
  return (
    <View
      style={{
        gap: theme.spacing.md,
        padding: theme.spacing.xl,
        borderRadius: theme.radius.xl,
        overflow: 'hidden',
        boxShadow: theme.shadows.md,
      }}
    >
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Pattern color={palette.white} opacity={0.07} size={36} />
      <View style={{ alignItems: 'center' }}>
        <SceneIllustration kind="welcome" size={150} />
      </View>
      <Text variant="title" style={{ color: palette.white }}>
        Connectez-vous pour commander
      </Text>
      <Text style={{ color: palette.brand200 }}>
        Suivez vos commandes, retrouvez votre panier sur tous vos appareils et accédez aux prix de votre profil.
      </Text>
      <Button label="Se connecter ou créer un compte" size="lg" fullWidth variant="accent" onPress={() => router.push('/login')} />
    </View>
  );
}

function Row({
  label,
  value,
  badge,
  onPress,
}: {
  label: string;
  value: string;
  badge?: string | null;
  /** Ligne cliquable (ouvre le détail). */
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
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
    </Pressable>
  );
}

function SignedIn() {
  const theme = useTheme();
  const phone = useSession((s) => s.phone);
  const me = useMe();
  const options = useOnboardingOptions();
  const [leaving, setLeaving] = useState(false);
  // Profil relu en revenant sur l'onglet (validation d'un profil pro par l'équipe, par exemple).
  useRefetchOnFocus(me.refetch);
  const favorites = useFavorites();
  const lists = useLists();
  const carnets = useCarnets();
  const storeCredit = useStoreCredit();

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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.xl,
          overflow: 'hidden',
          boxShadow: theme.shadows.md,
        }}
      >
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Pattern color={palette.white} opacity={0.07} size={36} />
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.accent500,
          }}
        >
          <Text variant="title" style={{ color: palette.brand950 }}>
            {(user?.firstName?.[0] ?? '?').toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          {me.isPending ? (
            <Skeleton width="60%" height={20} />
          ) : (
            <Text variant="subtitle" style={{ color: palette.white }}>{name || 'Profil à compléter'}</Text>
          )}
          {phone ? (
            <Text style={{ color: palette.brand200 }} accessibilityLabel="Numéro masqué">
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

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Shortcut
          icon="heart-outline"
          label="Mes favoris"
          detail={favorites.data ? `${favorites.data.items.length} produit${favorites.data.items.length > 1 ? 's' : ''}` : ' '}
          onPress={() => router.push('/favoris')}
        />
        <Shortcut
          icon="wallet-outline"
          label="Mes carnets"
          detail={carnets.data ? `${carnets.data.items.filter((c) => c.status === 'active').length} en cours` : ' '}
          onPress={() => router.push('/carnets')}
        />
        <Shortcut
          icon="list-outline"
          label="Mes listes d’achats"
          detail={lists.data ? `${lists.data.items.length} liste${lists.data.items.length > 1 ? 's' : ''}` : ' '}
          onPress={() => router.push('/listes')}
        />
      </View>

      {user ? (
        <View>
          <Row label="Profil" value={type?.label ?? '—'} badge={user.customerTypePending ? 'En cours de validation' : null} />
          <Row label="Tarifs appliqués" value={user.segmentLabel} />
          <Row label="Agence" value={agency?.name ?? '—'} />
          <Row label="Offres et promotions" value={user.consents.marketing ? 'Acceptées' : 'Refusées'} />
          {(storeCredit.data?.balance ?? 0) > 0 ? (
            <Row label="Mon avoir" value={`${formatFCFA(storeCredit.data!.balance)} · voir le détail`} onPress={() => router.push('/avoir')} />
          ) : null}
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

/** Raccourci vers une rubrique du compte (favoris, listes). */
function Shortcut({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: 'heart-outline' | 'list-outline' | 'wallet-outline';
  label: string;
  detail: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${detail}`}
      onPress={onPress}
      style={{
        flex: 1,
        gap: theme.spacing.xs,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        boxShadow: theme.shadows.sm,
      }}
    >
      <Ionicons name={icon} size={24} color={theme.colors.primary} />
      <Text variant="bodyStrong">{label}</Text>
      <Text variant="caption" color="textMuted">
        {detail}
      </Text>
    </PressableScale>
  );
}
