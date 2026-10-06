import type { ValidatedCartLine } from '@afrisime/shared';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { EmptyState, ErrorState, Screen, Text } from '@/components/ui';
import { comingSoon } from '@/lib/comingSoon';
import { useIsOffline } from '@/lib/network';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { CartChangedNotice } from '../components/CartChangedNotice';
import { CartLineItem } from '../components/CartLineItem';
import { CartSummary } from '../components/CartSummary';
import { useCartValidation } from '../hooks';
import { countItems, estimateSubtotal, useCart, type LocalCartLine } from '../store';

export function CartScreen() {
  const theme = useTheme();
  const lines = useCart((s) => s.lines);
  const setQuantity = useCart((s) => s.setQuantity);
  const removeLine = useCart((s) => s.remove);
  const restoreLine = useCart((s) => s.restore);
  const applyValidation = useCart((s) => s.applyValidation);
  const offline = useIsOffline();
  const validation = useCartValidation();
  const [checkingOut, setCheckingOut] = useState(false);
  const listRef = useRef<FlashListRef<LocalCartLine>>(null);

  const serverLines = useMemo(
    () => new Map<string, ValidatedCartLine>(validation.data?.lines.map((l) => [l.variantId, l]) ?? []),
    [validation.data],
  );
  const changes = validation.isCurrent ? (validation.data?.changes ?? []) : [];
  const hasUnavailable = lines.some(
    (l) => l.snapshot.availability === 'unavailable' || serverLines.get(l.variantId)?.status === 'unavailable',
  );
  const purchasableCount = countItems(lines);

  const onRemove = useCallback(
    (variantId: string) => {
      const removed = removeLine(variantId);
      if (!removed) return;
      showSnackbar({
        message: `${removed.line.snapshot.name} retiré du panier`,
        actionLabel: 'Annuler',
        onAction: () => restoreLine(removed.line, removed.index),
        durationMs: 5000,
      });
    },
    [removeLine, restoreLine],
  );

  const renderItem = useCallback(
    ({ item }: { item: LocalCartLine }) => (
      <View style={{ paddingBottom: theme.spacing.md }}>
        <CartLineItem
          line={item}
          server={serverLines.get(item.variantId)}
          onQuantityChange={setQuantity}
          onRemove={onRemove}
        />
      </View>
    ),
    [serverLines, setQuantity, onRemove, theme.spacing.md],
  );

  /** Revalide juste avant de continuer : on ne passe jamais au paiement sur un panier non vérifié. */
  const onCheckout = async () => {
    setCheckingOut(true);
    try {
      const result = await validation.refetch();
      const fresh = result.data;
      if (!fresh) {
        showSnackbar({ message: 'Vérification impossible. Réessayez dans un instant.' });
        return;
      }
      if (fresh.changes.length > 0 || changes.length > 0) {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
        showSnackbar({ message: 'Votre panier a changé : vérifiez avant de continuer.' });
        return;
      }
      if (hasUnavailable || fresh.lines.some((l) => l.status === 'unavailable')) {
        showSnackbar({ message: 'Retirez les articles indisponibles pour continuer.' });
        return;
      }
      comingSoon('La validation de commande (livraison et paiement)');
    } finally {
      setCheckingOut(false);
    }
  };

  if (lines.length === 0) {
    return (
      <Screen>
        <Text variant="title" accessibilityRole="header">
          Panier
        </Text>
        <EmptyState
          icon="cart-outline"
          title="Votre panier est vide"
          description="Ajoutez des produits depuis la boutique : votre panier est conservé même hors connexion."
          actionLabel="Découvrir la boutique"
          onAction={() => router.navigate('/boutique')}
        />
      </Screen>
    );
  }

  const serverTotal = validation.isCurrent && validation.data ? validation.data.subtotal : null;
  const blockingError = validation.isError && !validation.data && !offline;

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md }}>
        <Text variant="title" accessibilityRole="header">
          Panier
        </Text>
      </View>

      <FlashList
        ref={listRef}
        data={lines}
        renderItem={renderItem}
        keyExtractor={(l) => l.variantId}
        extraData={serverLines}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg }}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
            {changes.length > 0 && validation.data ? (
              <CartChangedNotice
                changes={changes}
                onAcknowledge={() => validation.data && applyValidation(validation.data)}
              />
            ) : null}
            {blockingError ? (
              <View style={{ minHeight: 220 }}>
                <ErrorState error={validation.error} onRetry={() => void validation.refetch()} />
              </View>
            ) : null}
          </View>
        }
      />

      <CartSummary
        itemCount={purchasableCount}
        serverTotal={serverTotal}
        estimate={estimateSubtotal(lines)}
        calculating={validation.isFetching && !offline}
        offline={offline}
        // Désactivé seulement sans issue possible ; sinon le clic explique quoi corriger.
        checkoutDisabled={offline || purchasableCount === 0}
        checkoutLoading={checkingOut}
        onCheckout={() => void onCheckout()}
        bottomInset={theme.spacing.md}
      />
    </Screen>
  );
}
