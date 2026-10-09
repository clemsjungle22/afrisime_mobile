import type { Quote, QuoteRequest } from '@afrisime/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '@/api/errors';
import { deliveryOptions } from '@/api/mock/checkoutEngine';
import { SEED_ADDRESS } from '@/api/mock/db';
import { useCart } from '@/features/cart/store';
import { checkoutApi } from '../api';
import { CheckoutScreen } from '../screens/CheckoutScreen';
import { useCheckout } from '../store';

jest.mock('../api', () => ({
  checkoutApi: { listAddresses: jest.fn(), getDeliveryOptions: jest.fn(), quote: jest.fn() },
}));
jest.mock('@/features/auth/hooks', () => ({
  useMe: () => ({ data: jest.requireActual('@/api/mock/db').SEED_USER }),
}));
jest.mock('@/features/auth/session', () => ({
  useSession: (select: (s: { status: string }) => unknown) => select({ status: 'authenticated' }),
}));
jest.mock('@/lib/network', () => ({ useIsOffline: () => false }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  Redirect: () => null,
}));

const api = checkoutApi as jest.Mocked<typeof checkoutApi>;
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function wrapper({ children }: { children: ReactNode }) {
  // gcTime infini : pas de minuteur de nettoyage qui survivrait au test.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

function quoteFor(body: QuoteRequest): Quote {
  const options = deliveryOptions(SEED_ADDRESS, new Date());
  return {
    quoteId: 'qte_1',
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    fulfillment: body.fulfillment,
    addressId: body.addressId,
    agencyId: body.agencyId,
    slot: options.delivery!.slots.find((s) => s.id === body.slotId)!,
    paymentMethod: body.paymentMethod,
    lines: [],
    subtotal: 9500,
    deliveryFee: 500,
    discountTotal: 0,
    storeCreditApplied: 0,
    total: 10000,
    currency: 'XOF',
    fulfillmentSummary: 'Livraison · Maison — Tokoin',
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useCheckout.getState().reset();
  useCart.getState().clear();
  useCart.getState().add(
    { slug: 'riz', name: 'Riz', brand: 'Savana', color: '#b7862b', imageUrl: null },
    { id: 'var_riz-parfume-savana_0', sku: 'r', label: 'Sac 5 kg', packaging: 'sac', price: 4750, compareAtPrice: null, availability: 'available', leadTimeDays: null, minQuantity: 1, isPro: false },
    2,
  );
  api.listAddresses.mockResolvedValue([SEED_ADDRESS]);
  api.getDeliveryOptions.mockImplementation(async () => deliveryOptions(SEED_ADDRESS, new Date()));
});

// Minuteurs simulés : le compte à rebours du devis ne doit pas survivre au test.
afterEach(async () => {
  await cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('CheckoutScreen', () => {
  it('pré-remplit les choix et affiche le total calculé par le serveur', async () => {
    api.quote.mockImplementation(async (body) => quoteFor(body));
    await render(<CheckoutScreen />, { wrapper });

    expect(await screen.findByText(/Confirmer · 10\s000\sFCFA/)).toBeOnTheScreen();
    expect(screen.getByText(/Zone 1 · Centre · livraison 500\sFCFA/)).toBeOnTheScreen();
    expect(api.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfillment: 'delivery',
        addressId: SEED_ADDRESS.id,
        paymentMethod: 'mixx',
        lines: [expect.objectContaining({ variantId: 'var_riz-parfume-savana_0', quantity: 2, expectedUnitPrice: 4750 })],
      }),
      expect.anything(),
    );
  });

  it('CART_CHANGED : retour au panier pour voir les changements', async () => {
    api.quote.mockRejectedValue(new ApiError({ code: 'CART_CHANGED', message: 'Votre panier a changé.', status: 409 }));
    await render(<CheckoutScreen />, { wrapper });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('minimum non atteint : message et lien vers la boutique', async () => {
    api.quote.mockRejectedValue(
      new ApiError({ code: 'MIN_ORDER_NOT_MET', message: "Livraison à partir de 2 000 FCFA d'achats.", status: 422 }),
    );
    await render(<CheckoutScreen />, { wrapper });
    expect(await screen.findByText(/Livraison à partir de 2 000 FCFA/)).toBeOnTheScreen();
    expect(screen.getByText('Compléter mon panier')).toBeOnTheScreen();
  });
});
