import type { CartValidateRequest, ValidatedCart } from '@afrisime/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSnackbar } from '@/stores/snackbar';
import { describeChange } from '../components/CartChangedNotice';
import { CartScreen } from '../screens/CartScreen';
import { useCart } from '../store';

const NBSP = ' ';
const mockValidate = jest.fn<Promise<ValidatedCart>, [CartValidateRequest]>();

jest.mock('../api', () => ({
  cartApi: { validate: (body: CartValidateRequest) => mockValidate(body) },
}));
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/lib/network', () => ({ useIsOffline: () => false }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Réponse « serveur » : prix +10 % sur la 1re ligne si `priceUp`. */
function serverFor(body: CartValidateRequest, priceUp: boolean): ValidatedCart {
  const lines = body.lines.map((l, i) => {
    const unitPrice = priceUp && i === 0 ? 5225 : (l.expectedUnitPrice ?? 0);
    return {
      variantId: l.variantId,
      productSlug: 'riz',
      productName: 'Riz parfumé',
      brand: 'Savana',
      variantLabel: 'Sac 5 kg',
      imageUrl: null,
      color: '#b7862b',
      availability: 'available' as const,
      leadTimeDays: null,
      minQuantity: 1,
      maxQuantity: null,
      unitPrice,
      requestedQuantity: l.quantity,
      quantity: l.quantity,
      lineTotal: unitPrice * l.quantity,
      status: unitPrice !== l.expectedUnitPrice ? ('price_changed' as const) : ('ok' as const),
    };
  });
  const changes = lines
    .filter((l, i) => l.unitPrice !== body.lines[i]?.expectedUnitPrice)
    .map((l, i) => ({
      type: 'price_changed' as const,
      variantId: l.variantId,
      productName: l.productName,
      variantLabel: l.variantLabel,
      oldPrice: body.lines[i]?.expectedUnitPrice ?? null,
      newPrice: l.unitPrice,
      oldQuantity: null,
      newQuantity: null,
    }));
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  return {
    lines,
    changes,
    subtotal,
    discountTotal: 0,
    total: subtotal,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    currency: 'XOF',
    validatedAt: '2026-10-06T10:00:00.000Z',
  };
}

function addRiz(quantity = 2) {
  useCart.getState().add(
    { slug: 'riz', name: 'Riz parfumé', brand: 'Savana', color: '#b7862b', imageUrl: null },
    {
      id: 'var_riz',
      sku: 'RIZ',
      label: 'Sac 5 kg',
      packaging: 'sac',
      price: 4750,
      compareAtPrice: null,
      availability: 'available',
      leadTimeDays: null,
      minQuantity: 1,
      isPro: false,
    },
    quantity,
  );
}

async function flush() {
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  useCart.getState().clear();
  useSnackbar.getState().hide();
  mockValidate.mockReset();
});

afterEach(() => jest.useRealTimers());

describe('CartScreen', () => {
  it('panier vide : invite à découvrir la boutique', async () => {
    await render(<CartScreen />, { wrapper });
    expect(screen.getByText('Votre panier est vide')).toBeOnTheScreen();
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('affiche le total SERVEUR une fois le panier vérifié', async () => {
    mockValidate.mockImplementation((body) => Promise.resolve(serverFor(body, false)));
    addRiz(2);
    await render(<CartScreen />, { wrapper });
    await flush();
    expect((await screen.findAllByText(`9${NBSP}500${NBSP}FCFA`)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Frais de livraison calculés à l’étape suivante.')).toBeOnTheScreen();
  });

  it('« Votre panier a changé » puis « J’ai compris » aligne le panier', async () => {
    mockValidate.mockImplementation((body) => Promise.resolve(serverFor(body, true)));
    addRiz(1);
    await render(<CartScreen />, { wrapper });
    await flush();

    expect(await screen.findByText('Votre panier a changé')).toBeOnTheScreen();
    // Testing Library normalise les espaces (insécables compris) : on accepte les deux.
    expect(screen.getByText(/4\s750\sFCFA → 5\s225\sFCFA/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText("J'ai compris"));
    await flush();
    expect(useCart.getState().lines[0]?.snapshot.unitPrice).toBe(5225);
    expect(screen.queryByText('Votre panier a changé')).toBeNull();
  });

  it('retirer un article propose « Annuler »', async () => {
    mockValidate.mockImplementation((body) => Promise.resolve(serverFor(body, false)));
    addRiz(1);
    await render(<CartScreen />, { wrapper });
    await fireEvent.press(screen.getByLabelText('Retirer Riz parfumé du panier'));
    expect(useCart.getState().lines).toHaveLength(0);

    const snack = useSnackbar.getState().current;
    expect(snack?.actionLabel).toBe('Annuler');
    act(() => snack?.onAction?.());
    expect(useCart.getState().lines).toHaveLength(1);
  });
});

describe('describeChange', () => {
  const base = { variantId: 'v', productName: 'Riz', variantLabel: 'Sac 5 kg', oldPrice: null, newPrice: null, oldQuantity: null, newQuantity: null };

  it('phrases claires pour chaque type', () => {
    expect(describeChange({ ...base, type: 'price_changed', oldPrice: 5000, newPrice: 4500 })).toContain('(baisse)');
    expect(describeChange({ ...base, type: 'quantity_reduced', oldQuantity: 8, newQuantity: 5 })).toContain('de 8 à 5');
    expect(describeChange({ ...base, type: 'unavailable' })).toContain("n'est plus disponible");
  });
});
