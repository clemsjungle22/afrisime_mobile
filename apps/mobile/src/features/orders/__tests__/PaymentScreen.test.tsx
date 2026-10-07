import type { CreatePaymentBody, Order, PaymentIntent } from '@afrisime/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ordersApi } from '../api';
import { PaymentScreen } from '../screens/PaymentScreen';

jest.mock('../api', () => ({ ordersApi: { getOrder: jest.fn(), createPayment: jest.fn(), getPayment: jest.fn() } }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ orderId: 'ord_1' }),
  Stack: { Screen: () => null },
}));
jest.mock('@/features/auth/session', () => ({
  useSession: (select: (s: { phone: string }) => unknown) => select({ phone: '+22890123456' }),
}));

const api = ordersApi as jest.Mocked<typeof ordersApi>;
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

const order = {
  id: 'ord_1',
  orderNumber: 'AFS-2026-000123',
  status: 'pending_payment',
  total: 10000,
  payable: true,
  fulfillmentSummary: 'Livraison · Maison — Tokoin',
  paymentDeadline: new Date(Date.now() + 30 * 60_000).toISOString(),
  payment: { method: 'mixx', status: 'initiated', paymentId: null, paidAt: null },
} as unknown as Order;

function intent(status: PaymentIntent['status'], id = 'pay_1'): PaymentIntent {
  return {
    id,
    orderId: 'ord_1',
    method: 'mixx',
    status,
    amount: 10000,
    action: { type: 'confirm_on_phone', url: null, instructions: 'Validez la demande Mixx by Yas.' },
    expiresAt: new Date(Date.now() + 90_000).toISOString(),
    failureReason: status === 'failed' ? 'Solde insuffisant.' : null,
  };
}

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  api.getOrder.mockResolvedValue(order);
});
afterEach(async () => {
  await cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('PaymentScreen', () => {
  it('« Confirmez sur votre téléphone », puis confirmation UNIQUEMENT sur statut serveur réussi', async () => {
    api.createPayment.mockResolvedValue(intent('pending'));
    api.getPayment.mockResolvedValueOnce(intent('pending')).mockResolvedValue(intent('succeeded'));
    await render(<PaymentScreen />, { wrapper });

    await fireEvent.press(await screen.findByText(/Payer 10\s000\sFCFA/));
    expect(api.createPayment).toHaveBeenCalledWith(
      { orderId: 'ord_1', method: 'mixx', phone: '+22890123456' } satisfies CreatePaymentBody,
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(await screen.findByText('Confirmez sur votre téléphone')).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();

    await tick(3_100);
    await tick(3_100);
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/order-confirmation/[orderId]', params: { orderId: 'ord_1' } });
  });

  it('échec : motif affiché, « Réessayer » repart avec une NOUVELLE clé', async () => {
    api.createPayment.mockResolvedValueOnce(intent('failed')).mockResolvedValueOnce(intent('pending', 'pay_2'));
    api.getPayment.mockImplementation(async (id) => intent(id === 'pay_1' ? 'failed' : 'pending', id));
    await render(<PaymentScreen />, { wrapper });

    await fireEvent.press(await screen.findByText(/Payer 10\s000\sFCFA/));
    expect(await screen.findByText('Paiement non abouti')).toBeOnTheScreen();
    expect(screen.getByText(/Solde insuffisant\./)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Réessayer'));
    await fireEvent.press(await screen.findByText(/Payer 10\s000\sFCFA/));
    const [, key1] = api.createPayment.mock.calls[0]!;
    const [, key2] = api.createPayment.mock.calls[1]!;
    expect(key2).not.toBe(key1);
  });
});
